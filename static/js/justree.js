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
    var setNodeRoot = shared.setNodeRoot;
    var rescanNodeRootSubtree = shared.rescanNodeRootSubtree;
    var getNodeSelected = shared.getNodeSelected;
    var setNodeSelected = shared.setNodeSelected;
    var clearNodeSelected = shared.clearNodeSelected;

    var GenerateEnum = {
        'GRID': 0,
        'GROW': 1
    };
    var ModalEnum = {
        'HEAR': 0,
        'EDIT': 1,
        'SHARE': 2,
        'SERVER': 3
    };

    var generateState = GenerateEnum.GROW;
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
            var leafCellsSorted = getLeafCellsSorted();
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
        }
    };

    var refreshGridDisplay = function () {
        $('#x-disp').html(gridX);
        $('#y-disp').html(gridY);
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
    var callbackGenerate = callbackEditSelectionDecorator(function (selected) {
        var replacement = null;
        switch (generateState) {
            case GenerateEnum.GRID:
                replacement = new RatioNode(1, selected.getRatio(), 0.0);
                for (var y = 0; y < gridY; ++y) {
                    var gridNodeY = new RatioNode(0, 1, 0.0);
                    replacement.addChild(gridNodeY);
                        for (var x = 0; x < gridX; ++x) {
                        var gridNodeX = new RatioNode(1, 1, 0.0);
                        gridNodeY.addChild(gridNodeX);
                    }
                }
                break;
            case GenerateEnum.GROW:
                replacement = tree.treeGrow(0, 1, growDepthMaxParam.val, growBreadthMaxParam.val, config.pTerm, config.nDims, config.ratios, config.pOn);
                replacement.setRatio(selected.getRatio());
                break;
            default:
                break;
        }

        if (replacement !== null) {
            tree.replaceSubtree(selected, replacement);
            setNodeSelected(replacement);
        }
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
            try {
                var loaded = tree.treeParse(justreesShared[i]);
            }
            catch (e) {
                console.log(e);
                alert('Invalid tree. Try another one.');
                return;
            }
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
            'timeLen': audio.timeLenParam.val,
            'freqMin': audio.freqMinParam.val,
            'freqMaxRat': audio.freqMaxRatParam.val,
            'author': $('#upload #author').val(),
            'name': $('#upload #name').val(),
            'justree': getNodeRoot().toString()
        };
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
                    justreesShared[i] = justree.justree;
                }
            },
            'error': function () {
                $('button#server').prop('disabled', true);
                alert('Server error. Sharing disabled');
            }
        });
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

        // modal callbacks
        $('button#hear').on('click', function () {
            modalState = ModalEnum.HEAR;
            $('div#edit').hide();
            $('div#share').hide();
            $('div#hear').show();
            clearNodeSelected();
            navChildStack = [];
            video.repaintDom();
        });
        $('button#edit').on('click', function () {
            modalState = ModalEnum.EDIT;
            $('div#hear').hide();
            $('div#share').hide();
            $('div#edit').show();
        });
        $('button#share').on('click', function () {
            modalState = ModalEnum.SHARE;
            $('div#hear').hide();
            $('div#edit').hide();
            $('div#share').show();
            clearNodeSelected();
            navChildStack = [];
            video.repaintDom();
        });
        $('button#grid').on('click', function () {
            generateState = GenerateEnum.GRID;
            $('div#grid').show();
            $('div#mutate').hide();
        });
        $('button#grow').on('click', function () {
            generateState = GenerateEnum.GROW;
            $('div#mutate').show();
            $('div#grid').hide();
        });

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
        $('button#generate').on('click', callbackGenerate);

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
        hookParamToSlider(config.blockSizePow2, '#synthesis #block-size');
        hookParamToSlider(config.gainParam, '#synthesis #gain');
        hookParamToSlider(config.timeLenParam, '#synthesis #time-len');
        hookParamToSlider(config.freqMinParam, '#synthesis #freq-min');
        hookParamToSlider(config.freqMaxRatParam, '#synthesis #freq-max-rat');
        hookParamToSlider(config.envAtkParam, '#synthesis #env-atk-ms');
        hookParamToSlider(config.envDcyParam, '#synthesis #env-dcy-ms');

        // share load
        $('#upload button').on('click', callbackShareUpload);
        callbackShareUpdate();

        // viewport resize callback
		$(window).resize(video.callbackCanvasResize);
        video.callbackCanvasResize();

        // request animation
        window.requestAnimationFrame(video.animate);
	};
	$(document).ready(callbackDomReady);

})(window.jQuery, window._, window.justree);