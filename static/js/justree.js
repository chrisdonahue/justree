window.justree = window.justree || {};

(function ($, _, justree) {
	/* require */
	if (!window.supportsWebAudio) {
		alert('Sorry, HTML5 Web Audio API not supported on this browser.');
		throw 'HTML5 Web Audio API not supported on this browser';
	}
	if (!window.supportsCanvas) {
		alert('Sorry, HTML5 Canvas not supported on this browser.');
		throw 'HTML5 Canvas not supported on this browser';
	}

    /* imports */
    var server = justree.server;
    var audio = justree.audio;
    var video = justree.video;
    var config = justree.config;
    var shared = justree.shared;
    var dsp = justree.dsp;
    var tree = justree.tree;
    var saturate = justree.saturate;

    var debugAssert = config.debugAssert;
    var ModalEnum = shared.ModalEnum;
    var PlayheadStateEnum = shared.PlayheadStateEnum;
    var RatioNode = tree.RatioNode;
    var growDepthMaxParam = config.growDepthMaxParam;
    var growBreadthMaxParam = config.growBreadthMaxParam;

    var ui = {};

    var GenerateEnum = {
        'GRID': 0,
        'GROW': 1
    };
    var generateState = GenerateEnum.GROW;

    /* callbacks */
	var callbackPlayClick = function () {
        shared.playheadState = PlayheadStateEnum.PLAYING;
        shared.playheadPosRel = 0.0;
	};
    var callbackLoopClick = function () {
        shared.playheadState = PlayheadStateEnum.LOOPING;
    };
    var callbackStopClick = function () {
        shared.playheadState = PlayheadStateEnum.STOPPED;
        shared.playheadPosRel = 0.0;
    };
    var callbackReverbToggle = function () {
        var $checked = $('#effects input[name=reverb]:checked');
        if ($checked.val() === 'on') {
            audio.scriptNode.connect(audio.reverbNode);
            audio.reverbNode.connect(audio.audioCtx.destination);
        }
        else {
            audio.reverbNode.disconnect();
            audio.scriptNode.connect(audio.audioCtx.destination);
        }
    };
    var hookParamToSlider = function (param, sliderSelector) {
        var $slider = $(sliderSelector);
        param.val = param.valInit;
        $slider.attr('min', param.min);
        $slider.attr('max', param.max);
        $slider.attr('step', param.step);
        $slider.attr('value', param.val);
        $slider.on('input', function (event) {
            param.val = event.target.value;
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

            switch (shared.modalState) {
                case ModalEnum.HEAR:
                    nodeSelected.setVelocity(nodeSelected.getVelocity() > 0.0 ? 0.0 : 1.0);
                    video.repaint();
                    break;
                case ModalEnum.EDIT:
                    var nodeSelectedPrev = shared.getNodeSelected();
                    var disable = nodeSelectedPrev === nodeSelected;
                    if (disable) {
                        shared.setNodeSelected(null);
                    }
                    else {
                        shared.setNodeSelected(nodeSelected);                    
                    }
                    navChildStack = [];
                    video.repaint();
                    break;
                default:
                    break;
            }
        }
    };
    var callbackTouchLeave = function (event) {};
    var callbackTouchCancel = function(event) {};

    var callbackRootClick = function (event) {
        var nodeSelected = shared.getNodeSelected();
        if (nodeSelected === null) {
            callbackLeafClick();
        }
        while (!shared.getNodeSelected().isRoot()) {
            callbackParentClick();
        }
    };
    var callbackParentClick = function () {
        var nodeSelected = shared.getNodeSelected();
        if (nodeSelected !== null && !nodeSelected.isRoot()) {
            navChildStack.push(nodeSelected);
            shared.setNodeSelected(nodeSelected.getParent());
        }
    };
    var callbackSiblingClick = function () {
        var nodeSelected = shared.getNodeSelected();
        if (nodeSelected !== null && !nodeSelected.isRoot()) {
            var parent = nodeSelected.getParent();
            var childIdx = parent.getChildIdxForChild(nodeSelected);
            shared.setNodeSelected(parent.getChild((childIdx + 1) % parent.getNumChildren()));
            navChildStack = [];
        }
    };
    var callbackChildClick = function () {
        var nodeSelected = shared.getNodeSelected();
        if (nodeSelected !== null && !nodeSelected.isLeaf()) {
            if (navChildStack.length > 0) {
                var navChild = navChildStack.pop();
                var navChildIdx = nodeSelected.getChildIdxForChild(navChild);
                if (navChildIdx >= 0) {
                    shared.setNodeSelected(navChild);
                }
                else {
                    // we have edited this subtree so fallback to random
                    navChildStack = [];
                    shared.setNodeSelected(nodeSelected.getRandomChild());
                }
            }
            else {
                // cant exactly remember how this would happen but we're covered
                shared.setNodeSelected(nodeSelected.getRandomChild());
            }
        }
    };
    var callbackLeafClick = function () { 
        var nodeSelected = shared.getNodeSelected();
        if (nodeSelected === null) {
            var leafCellsSorted = shared.getLeafCellsSorted();
            var leafCellRandom = leafCellsSorted[Math.floor(Math.random() * leafCellsSorted.length)];
            shared.setNodeSelected(leafCellRandom.node);
            navChildStack = [];
        }
        else {
            while (!shared.getNodeSelected().isLeaf()) {
                callbackChildClick();
            }
        }
    };
    var callbackZoomClick = function () {
        var nodeSelected = shared.getNodeSelected();
        if (nodeSelected !== null) {
            video.setZoomCell(nodeSelected.cell);
            video.repaint();
        }
    };

    var callbackUndoClick = function () {
        var statePrev = shared.undoStackUndo(shared.getNodeRoot().getCopy());
        if (statePrev !== null) {
            shared.clearNodeSelected();
            shared.setNodeRoot(statePrev);
            shared.rescanNodeRootSubtree();
            video.repaint();
        }
        //shared.undoDebugPrint();
    };
    var callbackRedoClick = function () {
        var stateNext = shared.undoStackRedo();
        if (stateNext !== null) {
            shared.clearNodeSelected();
            shared.setNodeRoot(stateNext);
            shared.rescanNodeRootSubtree();
            video.repaint();
        }
        //shared.undoDebugPrint();
    };

    var callbackEditSelectionDecorator = function (callback) {
        return function () {
            var nodeSelected = shared.getNodeSelected();
            if (nodeSelected !== null) {
                var backup = shared.getNodeRoot().getCopy();
                var subtreeModified = callback(nodeSelected);
                if (subtreeModified !== null) {
                    shared.undoStackPushChange(backup);
                    //shared.undoDebugPrint();
                    if (subtreeModified.isRoot()) {
                        shared.setNodeRoot(subtreeModified);
                    }
                    debugAssert(shared.getNodeRoot().isSane(), 'Root node insane after edit.');
                    shared.rescanNodeRootSubtree(subtreeModified);
                    video.repaint();
                }
            }
        }
    };
    var refreshGridDisplay = function () {
        $('#x-disp').html(ui.gridX);
        $('#y-disp').html(ui.gridY);
    };
    var callbackGridXIncrement = function () {
        ui.gridX += 1;
        refreshGridDisplay();
    };
    var callbackGridXDecrement = function () {
        if (ui.gridX >= 2) {
            ui.gridX -= 1;
        }
        refreshGridDisplay();
    };
    var callbackGridYIncrement = function () {
        ui.gridY += 1;
        refreshGridDisplay();
    };
    var callbackGridYDecrement = function () {
        if (ui.gridY >= 2) {
            ui.gridY -= 1;
        }
        refreshGridDisplay();
    };
    var callbackGenerate = callbackEditSelectionDecorator(function (selected) {
        var replacement = null;
        switch (generateState) {
            case GenerateEnum.GRID:
                replacement = new RatioNode(1, selected.getRatio(), 0.0);
                for (var y = 0; y < ui.gridY; ++y) {
                    var gridNodeY = new RatioNode(0, 1, 0.0);
                    replacement.addChild(gridNodeY);
                        for (var x = 0; x < ui.gridX; ++x) {
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
            shared.setNodeSelected(replacement);
        }
        return replacement;
    });

    var callbackCutClick = callbackEditSelectionDecorator(function (selected) {
        shared.pushNodeClipboard(selected.getCopy());
        selected.deleteChildren();
        shared.clearNodeSelected();
        return selected;
    });
    var callbackCopyClick = callbackEditSelectionDecorator(function (selected) {
        shared.pushNodeClipboard(selected.getCopy())
        shared.clearNodeSelected();
        return null;
    });
    var callbackPasteClick = callbackEditSelectionDecorator(function (selected) {
        var nodeClipboard = shared.peekNodeClipboard();
        if (nodeClipboard !== null) {
            var copy = shared.nodeClipboard.getCopy();
            if (selected.isRoot()) {
                shared.setNodeRoot(copy);
                return shared.getNodeRoot();
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
            shared.clearNodeSelected();
            return selected;
        }
        else {
            var parent = selected.getParent();
            var childIdx = parent.getChildIdxForChild(selected);
            if (childIdx >= 0) {
                parent.deleteChild(childIdx);
                shared.clearNodeSelected();
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


    var callbackEditSelectionDecorator = function (callback) {
        return function () {
            var nodeSelected = shared.getNodeSelected();
            if (nodeSelected !== null) {
                var backup = shared.getNodeRoot().getCopy();
                var subtreeModified = callback(nodeSelected);
                if (subtreeModified !== null) {
                    shared.undoStackPushChange(backup);
                    //shared.undoDebugPrint();
                    if (subtreeModified.isRoot()) {
                        shared.setNodeRoot(subtreeModified);
                    }
                    debugAssert(shared.getNodeRoot().isSane(), 'Root node insane after edit.');
                    shared.rescanNodeRootSubtree(subtreeModified);
                    video.repaint();
                }
            }
        }
    };
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
            shared.clearNodeSelected();
            var backup = shared.getNodeRoot().getCopy();
            shared.undoStackPushChange(backup);
            shared.setNodeRoot(loaded);
            shared.rescanNodeRootSubtree(loaded);
            video.repaint();
        };
    };
    var callbackShareUpload = function () {
        var submission = {
            'timeLen': audio.timeLenParam.val,
            'freqMin': audio.freqMinParam.val,
            'freqMaxRat': audio.freqMaxRatParam.val,
            'author': $('#upload #author').val(),
            'name': $('#upload #name').val(),
            'justree': shared.getNodeRoot().toString()
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
        server.init();
		audio.init();
		video.init('justree-ui');

        // connect
        server.connect(config.synthIp, config.synthPort);
		
		// generate tree
		var root = tree.treeGrow(0, config.depthMin, config.depthMax, config.breadthMax, config.pTerm, config.nDims, config.ratios, config.pOn);
		shared.setNodeRoot(root);
        shared.rescanNodeRootSubtree();

        // modal callbacks
        $('button#hear').on('click', function () {
            shared.modalState = ModalEnum.HEAR;
            $('div#edit').hide();
            $('div#share').hide();
            $('div#hear').show();
            shared.clearNodeSelected();
            navChildStack = [];
            video.repaint();
        });
        $('button#edit').on('click', function () {
            shared.modalState = ModalEnum.EDIT;
            $('div#hear').hide();
            $('div#share').hide();
            $('div#edit').show();
        });
        $('button#share').on('click', function () {
            shared.modalState = ModalEnum.SHARE;
            $('div#hear').hide();
            $('div#edit').hide();
            $('div#share').show();
            shared.clearNodeSelected();
            navChildStack = [];
            video.repaint();
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

        // server callbacks
        $('button#connect').on('click', function () {
            server.connect($('#server #ip').val(), $('#server #port').val());
        });
        $('button#disconnect').on('click', server.disconnect)
        $('button#osc-send').on('click', function () {
            var oscAddress = $('#server #osc-address').val();
            var oscParameters = JSON.parse($('#server #osc-params').val());
            server.sendOsc(oscAddress, oscParameters);
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
        ui.gridX = 2;
        ui.gridY = 2;
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
        $('#playback #play').on('click', callbackPlayClick);
        $('#playback #loop').on('click', callbackLoopClick);
        $('#playback #stop').on('click', callbackStopClick);
        hookParamToSlider(audio.gainParam, '#synthesis #gain');
        hookParamToSlider(audio.timeLenParam, '#synthesis #time-len');
        hookParamToSlider(audio.freqMinParam, '#synthesis #freq-min');
        hookParamToSlider(audio.freqMaxRatParam, '#synthesis #freq-max-rat');
        hookParamToSlider(audio.envAtkParam, '#synthesis #env-atk-ms');
        hookParamToSlider(audio.envDcyParam, '#synthesis #env-dcy-ms');
        callbackReverbToggle();

        // share load
        $('#upload button').on('click', callbackShareUpload);
        callbackShareUpdate();

        // viewport resize callback
		$(window).resize(video.callbackWindowResize);
        video.callbackWindowResize();

        // start animation
		window.requestAnimationFrame(video.animate);
	};
	$(document).ready(callbackDomReady);

})(window.jQuery, window._, window.justree);