window.justree = window.justree || {};

(function ($, _, justree) {
	/* require */
	if (!window.supportsCanvas) {
		alert('Sorry, graphics cannot be displayed on this browser.');
		throw 'HTML5 Canvas not supported on this browser';
	}

    /* imports */
    var config = justree.config;
    var clock = justree.clock;
    var tree = justree.tree;
    var shared = justree.shared;
    var osc = justree.osc;
    var video = justree.video;

    var debugAssert = config.debugAssert;
    var ModalEnum = ModalEnum;
    var PlayheadStateEnum = PlayheadStateEnum;
    var RatioNode = tree.RatioNode;
    var growDepthMaxParam = config.growDepthMaxParam;
    var growBreadthMaxParam = config.growBreadthMaxParam;
    var getNodeRoot = shared.getNodeRoot;
    var setNodeRoot = shared.setNodeRoot;
    var getNodeRootLeafCellsSorted = shared.getNodeRootLeafCellsSorted;
    var rescanNodeRootSubtree = shared.rescanNodeRootSubtree;
    var getNodeSelected = shared.getNodeSelected;
    var setNodeSelected = shared.setNodeSelected;
    var clearNodeSelected = shared.clearNodeSelected;

    var ModalEnum = {
        'HEAR': 0,
        'EDIT': 1,
        'SHARE': 2,
        'SERVER': 3
    };

    var undoStack = [];
    var undoStackIdx = 0;
    var modalState = ModalEnum.EDIT;

    var clearNodeClipboard = function () {
        nodeClipboard = null;
    };
    var pushNodeClipboard = function (node) {
        nodeClipboard = node;
    };
    var peekNodeClipboard = function () {
        return nodeClipboard;
    };
    var undoDebugPrint = function () {
        console.log('-------');
        for (var i = 0; i < undoStack.length; ++i) {
            var str = String(i);
            if (i === undoStackIdx) {
                str += '->';
            }
            else {
                str += '  ';
            }
            var node = undoStack[i];
            if (node === null) {
                str += 'null';
            }
            else {
                str += node.toString();
            }
            console.log(str);
        }
    };
    var undoStackPushChange = function (node) {
        // if we've branched, delete everything 
        while (undoStackIdx < undoStack.length) {
            undoStack.pop();
        }
        if (undoStack.length < undoStackIdx) {
            undoStack.push(node);
        }
        else {
            undoStack[undoStackIdx] = node;
        }
        undoStackIdx += 1;
    };
    var undoStackUndo = function (node) {
        if (undoStackIdx === 0) {
            return null;
        }
        if (undoStackIdx === undoStack.length) {
            undoStack.push(node);
        }
        var result = undoStack[undoStackIdx - 1];
        undoStackIdx -= 1;
        return result;
    };
    var undoStackRedo = function () {
        if (undoStackIdx + 1 < undoStack.length) {
            var result = undoStack[undoStackIdx + 1];
            undoStackIdx += 1;
            return result;
        }
        return null;
    };

    /* callbacks */
	var callbackPlayClick = function () {
        clock.start();
	};
    var callbackLoopClick = function () {
        clock.loop();
    };
    var callbackStopClick = function () {
        clock.stop();
    };
    var hookParamToSlider = function (param, sliderSelector) {
        var $slider = $(sliderSelector);
        param.val = param.valInit;
        $slider.attr('min', param.min);
        $slider.attr('max', param.max);
        $slider.attr('step', param.step);
        $slider.attr('value', param.val);
        $slider.on('input', function (event) {
            param.val = Number(event.target.value);
        });
    };

    var navChildStack = [];
    var callbackTouchStart = function (event) {};
    var callbackTouchMove = function (event) {};
    var callbackTouchEnd = function (event) {
        var touchEvent = event.originalEvent;
        for (var i = 0; i < touchEvent.changedTouches.length; ++i) {
            var touch = touchEvent.changedTouches[i];
            var offset = $(event.target).offset();
            var x = touch.pageX - offset.left;
            var y = touch.pageY - offset.top;
            var nodeSelected = video.posAbsToLeafNode(x, y);
            if (nodeSelected === null) {
                continue;
            }

            switch (modalState) {
                case ModalEnum.HEAR:
                    nodeSelected.setVelocity(nodeSelected.getVelocity() > 0.0 ? 0.0 : 1.0);
                    video.repaintDom();
                    break;
                case ModalEnum.EDIT:
                    var nodeSelectedPrev = getNodeSelected();
                    var disable = nodeSelectedPrev === nodeSelected;
                    if (disable) {
                        setNodeSelected(null);
                    }
                    else {
                        setNodeSelected(nodeSelected);                    
                    }
                    navChildStack = [];
                    video.repaintDom();
                    break;
                default:
                    break;
            }
        }
    };
    var callbackTouchLeave = function (event) {};
    var callbackTouchCancel = function(event) {};

    var callbackRootClick = function (event) {
        var nodeSelected = getNodeSelected();
        if (nodeSelected === null) {
            callbackLeafClick();
        }
        while (!getNodeSelected().isRoot()) {
            callbackParentClick();
        }
    };
    var callbackParentClick = function () {
        var nodeSelected = getNodeSelected();
        if (nodeSelected !== null && !nodeSelected.isRoot()) {
            navChildStack.push(nodeSelected);
            setNodeSelected(nodeSelected.getParent());
        }
    };
    var callbackSiblingClick = function () {
        var nodeSelected = getNodeSelected();
        if (nodeSelected !== null && !nodeSelected.isRoot()) {
            var parent = nodeSelected.getParent();
            var childIdx = parent.getChildIdxForChild(nodeSelected);
            setNodeSelected(parent.getChild((childIdx + 1) % parent.getNumChildren()));
            navChildStack = [];
        }
    };
    var callbackChildClick = function () {
        var nodeSelected = getNodeSelected();
        if (nodeSelected !== null && !nodeSelected.isLeaf()) {
            if (navChildStack.length > 0) {
                var navChild = navChildStack.pop();
                var navChildIdx = nodeSelected.getChildIdxForChild(navChild);
                if (navChildIdx >= 0) {
                    setNodeSelected(navChild);
                }
                else {
                    // we have edited this subtree so fallback to random
                    navChildStack = [];
                    setNodeSelected(nodeSelected.getRandomChild());
                }
            }
            else {
                // cant exactly remember how this would happen but we're covered
                setNodeSelected(nodeSelected.getRandomChild());
            }
        }
    };
    var callbackLeafClick = function () { 
        var nodeSelected = getNodeSelected();
        if (nodeSelected === null) {
            var leafCellsSorted = getNodeRootLeafCellsSorted();
            var leafCellRandom = leafCellsSorted[Math.floor(Math.random() * leafCellsSorted.length)];
            setNodeSelected(leafCellRandom.node);
            navChildStack = [];
        }
        else {
            while (!getNodeSelected().isLeaf()) {
                callbackChildClick();
            }
        }
    };
    var callbackZoomClick = function () {
        var nodeSelected = getNodeSelected();
        if (nodeSelected !== null) {
            video.setZoomCell(nodeSelected.cell);
            video.repaintFull();
        }
    };

    var callbackUndoClick = function () {
        var statePrev = undoStackUndo(getNodeRoot().getCopy());
        if (statePrev !== null) {
            clearNodeSelected();
            setNodeRoot(statePrev);
            rescanNodeRootSubtree();
            video.repaintFull();
        }
        //undoDebugPrint();
    };
    var callbackRedoClick = function () {
        var stateNext = undoStackRedo();
        if (stateNext !== null) {
            clearNodeSelected();
            setNodeRoot(stateNext);
            rescanNodeRootSubtree();
            video.repaintFull();
        }
        //undoDebugPrint();
    };

    var callbackEditSelectionDecorator = function (callback) {
        return function () {
            var nodeSelected = getNodeSelected();
            if (nodeSelected !== null) {
                var backup = getNodeRoot().getCopy();
                var subtreeModified = callback(nodeSelected);
                if (subtreeModified !== null) {
                    undoStackPushChange(backup);
                    //undoDebugPrint();
                    if (subtreeModified.isRoot()) {
                        setNodeRoot(subtreeModified);
                    }
                    debugAssert(getNodeRoot().isSane(), 'Root node insane after edit.');
                    rescanNodeRootSubtree(subtreeModified);
                    video.repaintFull();
                }
            }
            else {
                alert('Select a node first.');
            }
        }
    };

    var refreshGridDisplay = function () {
        $('#x-disp').html('X: ' + String(gridX));
        $('#y-disp').html('Y: ' + String(gridY));
    };
    var gridX = 2;
    var gridY = 2;
    var callbackGridXIncrement = function () {
        gridX += 1;
        refreshGridDisplay();
    };
    var callbackGridXDecrement = function () {
        if (gridX >= 2) {
            gridX -= 1;
        }
        refreshGridDisplay();
    };
    var callbackGridYIncrement = function () {
        gridY += 1;
        refreshGridDisplay();
    };
    var callbackGridYDecrement = function () {
        if (gridY >= 2) {
            gridY -= 1;
        }
        refreshGridDisplay();
    };
    var callbackGenerateGrid = callbackEditSelectionDecorator(function (selected) {
        replacement = new RatioNode(1, selected.getRatio(), 0.0);
        for (var y = 0; y < gridY; ++y) {
            var gridNodeY = new RatioNode(0, 1, 0.0);
            replacement.addChild(gridNodeY);
                for (var x = 0; x < gridX; ++x) {
                var gridNodeX = new RatioNode(1, 1, 0.0);
                gridNodeY.addChild(gridNodeX);
            }
        }
        tree.replaceSubtree(selected, replacement);
        setNodeSelected(replacement);
        return replacement;
    });
    var callbackMutate = callbackEditSelectionDecorator(function (selected) {
        replacement = tree.treeGrow(0, 1, growDepthMaxParam.val, growBreadthMaxParam.val, config.pTerm, config.nDims, config.ratios, config.pOn);
        replacement.setRatio(selected.getRatio());
        tree.replaceSubtree(selected, replacement);
        setNodeSelected(replacement);
        return replacement;
    });

    var callbackCutClick = callbackEditSelectionDecorator(function (selected) {
        pushNodeClipboard(selected.getCopy());
        selected.deleteChildren();
        clearNodeSelected();
        return selected;
    });
    var callbackCopyClick = callbackEditSelectionDecorator(function (selected) {
        pushNodeClipboard(selected.getCopy())
        clearNodeSelected();
        return null;
    });
    var callbackPasteClick = callbackEditSelectionDecorator(function (selected) {
        var nodeClipboard = peekNodeClipboard();
        if (nodeClipboard !== null) {
            var copy = nodeClipboard.getCopy();
            if (selected.isRoot()) {
                setNodeRoot(copy);
                return getNodeRoot();
            }
            else {
                var parent = selected.getParent();
                var childIdx = parent.getChildIdxForChild(selected);
                if (childIdx >= 0) {
                    copy.setRatio(selected.getRatio());
                    parent.setChild(childIdx, copy);
                    return parent;
                }
            }
        }
        return null;
    });
    var callbackClearClick = callbackEditSelectionDecorator(function (selected) {
        if (!selected.isLeaf()) {
            selected.deleteChildren();
            return selected;
        }
        return null;
    });
    var callbackDeleteClick = callbackEditSelectionDecorator(function (selected) {
        if (selected.isRoot()) {
            callbackClearClick(selected);
            clearNodeSelected();
            return selected;
        }
        else {
            var parent = selected.getParent();
            var childIdx = parent.getChildIdxForChild(selected);
            if (childIdx >= 0) {
                parent.deleteChild(childIdx);
                clearNodeSelected();
                if (parent.getNumChildren() === 1) {
                    parent.deleteChild(0);
                }
                return parent;
            }
        }
        return null;
    });
    var callbackRatioDecrementClick = callbackEditSelectionDecorator(function (selected) {
        var ratio = selected.getRatio();
        if (ratio > 1.0) {
            selected.setRatio(ratio - 1.0);
            return selected;
        }
        return null;
    });
    var callbackRatioIncrementClick = callbackEditSelectionDecorator(function (selected) {
        var ratio = selected.getRatio();
        selected.setRatio(ratio + 1.0);
        return selected;
    });
    var callbackMoveLClick = callbackEditSelectionDecorator(function (selected) {
        if (selected.isRoot()) {
            return null;
        }
        else {
            var parent = selected.getParent();
            var childIdx = parent.getChildIdxForChild(selected);
            if (childIdx >= 0) {
                parent.moveChildLeft(childIdx);
                return parent;
            }
        }
        return null;
    });
    var callbackMoveRClick = callbackEditSelectionDecorator(function (selected) {
        if (selected.isRoot()) {
            return null;
        }
        else {
            var parent = selected.getParent();
            var childIdx = parent.getChildIdxForChild(selected);
            if (childIdx >= 0) {
                parent.moveChildRight(childIdx);
                return parent;
            }
        }
        return null;
    });
    var callbackFlipClick = callbackEditSelectionDecorator(function flipRecursive(subtree) {
        var dim = subtree.getDim();
        dim = modPls(dim + 1, 2);
        subtree.setDim(dim);
        subtree.forEachChild(flipRecursive);
        return subtree;
    });
    var callbackSplitTClick = callbackEditSelectionDecorator(function (selected) {
        if (selected.isLeaf()) {
            selected.setDim(0);
            selected.addChild(new RatioNode(1, 1, 0.0));
            selected.addChild(new RatioNode(1, 1, 0.0));
            return selected;
        }
        else {
            // add child
            if (selected.getDim() === 0) {
                selected.addChild(new RatioNode(1, selected.getChildrenRatioSum(), 0.0));
                return selected;
            }
            else {
                // add parent
                var newParent = new RatioNode(0, selected.getRatio(), 0.0);
                if (selected.isRoot()) {
                    newParent.addChild(selected);
                    newParent.addChild(new RatioNode(1, selected.getRatio(), 0.0));
                    return newParent;
                }
                else {
                    var parent = selected.getParent();
                    var newParentIdx = parent.getChildIdxForChild(selected);
                    newParent.addChild(selected);
                    newParent.addChild(new RatioNode(1, selected.getRatio(), 0.0));
                    parent.setChild(newParentIdx, newParent);
                    return parent;
                }
            }
        }
    });
    var callbackSplitFClick = callbackEditSelectionDecorator(function (selected) {
        if (selected.isLeaf()) {
            selected.setDim(1);
            selected.addChild(new RatioNode(0, 1, 0.0));
            selected.addChild(new RatioNode(0, 1, 0.0));
            return selected;
        }
        else {
            // add child
            if (selected.getDim() === 1) {
                selected.addChild(new RatioNode(0, selected.getChildrenRatioSum(), 0.0));
                return selected;
            }
            else {
                // add parent
                var newParent = new RatioNode(1, selected.getRatio(), 0.0);
                if (selected.isRoot()) {
                    newParent.addChild(selected);
                    newParent.addChild(new RatioNode(0, selected.getRatio(), 0.0));
                    return newParent;
                }
                else {
                    var parent = selected.getParent();
                    var newParentIdx = parent.getChildIdxForChild(selected);
                    newParent.addChild(selected);
                    newParent.addChild(new RatioNode(0, selected.getRatio(), 0.0));
                    parent.setChild(newParentIdx, newParent);
                    return parent;
                }
            }
        }
    });

    var justreesShared = {};
    var callbackShareLoadGenerator = function (i) {
        return function () {
            var jsonShared = justreesShared[i];
            try {
                var loaded = tree.treeParse(jsonShared.justree);
            }
            catch (e) {
                console.log(e);
                alert('Invalid tree. Try another one.');
                return;
            }

            // update sliders
            $('#gain').attr('value', jsonShared.velocity).trigger('input');
            $('#time-len').attr('value', jsonShared.timeLen).trigger('input');
            $('#freq-min').attr('value', jsonShared.freqMin).trigger('input');
            $('#freq-max-rat').attr('value', jsonShared.freqMaxRat).trigger('input');
            $('#env-atk-ms').attr('value', jsonShared.envAtkMs).trigger('input');
            $('#env-dcy-ms').attr('value', jsonShared.envDcyMs).trigger('input');

            // update UI
            clearNodeSelected();
            var backup = getNodeRoot().getCopy();
            undoStackPushChange(backup);
            setNodeRoot(loaded);
            rescanNodeRootSubtree(loaded);
            video.repaintFull();
        };
    };
    var callbackShareUpload = function () {
        var submission = {
            'velocity': config.gainParam.val,
            'timeLen': config.timeLenParam.val,
            'freqMin': config.freqMinParam.val,
            'freqMaxRat': config.freqMaxRatParam.val,
            'envAtkMs': config.envAtkParam.val,
            'envDcyMs': config.envDcyParam.val,
            'clientFingerprint': config.clientFingerprint,
            'author': $('#upload #author').val(),
            'name': $('#upload #name').val(),
            'justree': getNodeRoot().toString()
        };
        if (!confirm('Publish this tree to the server for everyone to see?')) {
            return;
        }
        $.ajax({
            'method': 'POST',
            'url': config.shareRoute,
            'data': submission,
            'success': callbackShareUpdate,
            'error': function (data) {
                if (data.status === 400) {
                    alert(data.responseText);
                }
                else {
                    alert('Failed to validate. Ask Chris...');
                }
            }
        });
    };
    var callbackShareUpdate = function () {
        $.ajax({
            'method': 'GET',
            'url': config.shareRoute,
            'success': function (data) {
                var $tbody = $('table#shared tbody');
                $tbody.find('tr').remove();
                for (var i = 0; i < data.length; ++i) {
                    var justree = data[i];
                    var $tr = $('<tr></tr>');
                    var $tdauth = $('<td class="author"></td>');
                    $tdauth.html(justree.author);
                    var $tdname = $('<td class="name"></td>');
                    $tdname.html(justree.name);
                    var $tdload = $('<td class="load"><button>Load</button></td>');
                    $tdload.find('button').on('click', callbackShareLoadGenerator(i));
                    $tr.append($tdauth);
                    $tr.append($tdname);
                    $tr.append($tdload);
                    $tbody.append($tr);
                    justreesShared[i] = justree;
                }
            },
            'error': function () {
                $('button#server').prop('disabled', true);
                alert('Server error. Sharing disabled');
            }
        });
    };

    var callbackWindowResize = function () {
        var windowWidth = $(window).width();        
        var windowHeight = $(window).height();
        var $display = $('#display');
        var canvasWidth = windowWidth;
        var canvasHeight = windowHeight - $display.offset().top;
        video.canvasResize(canvasWidth, canvasHeight);
    };

	/* init */
	var callbackDomReady = function () {
        // init
        shared.init();
        clock.init();
        video.init($('#justree-ui').get(0));
        osc.init();
        osc.serverConnect();
		
		// generate tree
		var root = tree.treeGrow(0, config.initDepthMin, config.initDepthMax, config.initBreadthMax, config.pTerm, config.nDims, config.ratios, config.pOn);
		setNodeRoot(root);
        rescanNodeRootSubtree();

        // tab callbacks
        $('#hear').on('click', function () {
            modalState = ModalEnum.HEAR;
            clearNodeSelected();
            navChildStack = [];
            $(window).trigger('resize');
        });
        $('#edit').on('click', function () {
            modalState = ModalEnum.EDIT;
            clock.stop();
            $(window).trigger('resize');
        });
        $('#share').on('click', function () {
            modalState = ModalEnum.SHARE;
            clearNodeSelected();
            navChildStack = [];
            $(window).trigger('resize');
        });

        // selection callbacks
        $('button#parent').on('click', callbackParentClick);
        $('button#sibling').on('click', callbackSiblingClick);
        $('button#child').on('click', callbackChildClick);
        $('button#root').on('click', callbackRootClick);
        $('button#leaf').on('click', callbackLeafClick);
        $('button#zoom').on('click', callbackZoomClick);

        // undo callbacks
        $('button#undo').on('click', callbackUndoClick);
        $('button#redo').on('click', callbackRedoClick);

        // generator callbacks
        refreshGridDisplay();
        $('button#x-inc').on('click', callbackGridXIncrement);
        $('button#x-dec').on('click', callbackGridXDecrement);
        $('button#y-inc').on('click', callbackGridYIncrement);
        $('button#y-dec').on('click', callbackGridYDecrement);
        hookParamToSlider(growDepthMaxParam, '#depth-max');
        hookParamToSlider(growBreadthMaxParam, '#breadth-max');
        $('button#generate-grid').on('click', callbackGenerateGrid);
        $('button#mutate').on('click', callbackMutate);

        // edit selection callbacks
        $('button#clear').on('click', callbackClearClick);
        $('button#delete').on('click', callbackDeleteClick);
        $('button#ratio-dec').on('click', callbackRatioDecrementClick);
        $('button#ratio-inc').on('click', callbackRatioIncrementClick);
        $('button#move-l').on('click', callbackMoveLClick);
        $('button#move-r').on('click', callbackMoveRClick);
        $('button#flip').on('click', callbackFlipClick);
        $('button#split-t').on('click', callbackSplitTClick);
        $('button#split-f').on('click', callbackSplitFClick);

        // clipboard callbacks
        $('button#cut').on('click', callbackCutClick);
        $('button#copy').on('click', callbackCopyClick);
        $('button#paste').on('click', callbackPasteClick);

        // tabs
        //$('#tabs').tabs({active: 1});
        //$('button').button();

        // audio callbacks
		//$('body').css({'overflow': 'hidden'});
        if (clock.usingWebAudio()) {
            $('.hide-for-web-audio').hide();
        }
        $('#playback #play').on('click', callbackPlayClick);
        $('#playback #loop').on('click', callbackLoopClick);
        $('#playback #stop').on('click', callbackStopClick);
        hookParamToSlider(config.blockSizePow2, '#block-size');
        hookParamToSlider(config.gainParam, '#gain');
        hookParamToSlider(config.timeLenParam, '#time-len');
        hookParamToSlider(config.freqMinParam, '#freq-min');
        hookParamToSlider(config.freqMaxRatParam, '#freq-max-rat');
        hookParamToSlider(config.envAtkParam, '#env-atk-ms');
        hookParamToSlider(config.envDcyParam, '#env-dcy-ms');

        // share load
        $('#upload button').on('click', callbackShareUpload);
        callbackShareUpdate();

        // canvas mouse/touch events
        if (window.supportsTouchEvents) {
            $('#justree-ui').on('touchstart', callbackTouchStart);
            $('#justree-ui').on('touchmove', callbackTouchMove);
            $('#justree-ui').on('touchend', callbackTouchEnd);
            $('#justree-ui').on('touchleave', callbackTouchLeave);
            $('#justree-ui').on('touchcancel', callbackTouchCancel);
        }
        else {
            var mouseToTouchEvent = window.mouseToTouchEvent;
            $('#justree-ui').on('mousedown', mouseToTouchEvent(callbackTouchStart));
            $('#justree-ui').on('mousemove', mouseToTouchEvent(callbackTouchMove));
            $('#justree-ui').on('mouseup', mouseToTouchEvent(callbackTouchEnd));
            $('#justree-ui').on('mouseleave', mouseToTouchEvent(callbackTouchLeave));
        }

        // viewport resize callback
		$(window).on('resize', callbackWindowResize);
        $(window).trigger('resize');

        // request animation
        window.requestAnimationFrame(video.animate);
	};
	$(document).ready(callbackDomReady);

})(window.jQuery, window._, window.justree);