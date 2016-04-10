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
    var hookAudioParamToSlider = function (param, sliderSelector) {
        var $slider = $(sliderSelector);
        $slider.attr('min', param['min']);
        $slider.attr('max', param['max']);
        $slider.attr('step', param['step']);
        $slider.attr('value', param['val']);
        $slider.on('input', function (event) {
            param['val'] = event.target.value;
        });
    };

    var navChildStack = [];
    var callbackTouchStart = function (event) {};
    var callbackTouchMove = function (event) {};
    var callbackTouchEnd = function (event) {
        var touchEvent = event.originalEvent;
        for (var i = 0; i < touchEvent.changedTouches.length; ++i) {
            var touch = touchEvent.changedTouches[i];
            var nodeSelected = video.posAbsToLeafNode(touch.clientX, touch.clientY);
            if (nodeSelected === null) {
                continue;
            }

            switch (shared.modalState) {
                case ModalEnum.HEAR:
                    nodeSelected.on = !nodeSelected.on;
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
            selected.addChild(new tree.RatioNode(0, 1, false));
            selected.addChild(new tree.RatioNode(0, 1, false));
            return selected;
        }
        else {
            return null;
        }
    });
    var callbackSplitFClick = callbackEditSelectionDecorator(function (selected) {
        if (selected.isLeaf()) {
            selected.setDim(1);
            selected.addChild(new tree.RatioNode(1, 1, false));
            selected.addChild(new tree.RatioNode(1, 1, false));
            return selected;
        }
        else {
            return null;
        }
    });
    var callbackAddTSiblingClick = callbackEditSelectionDecorator(function (selected) {
        if (selected.isRoot()) {
            var rootNew = new tree.RatioNode((selected.getDim() + 1) % 2, 1, false);
            rootNew.addChild(selected);
            rootNew.addChild(new tree.RatioNode(0, selected.getRatio(), false))
            return rootNew;
        }
        else {
            var parent = selected.getParent();
            parent.addChild(new tree.RatioNode(0, selected.getRatio(), false));
            return parent;
        }
    });
    var callbackAddFSiblingClick = callbackEditSelectionDecorator(function (selected) {
        if (selected.isRoot()) {
            var rootNew = new tree.RatioNode((selected.getDim() + 1) % 2, 1, false);
            rootNew.addChild(selected);
            rootNew.addChild(new tree.RatioNode(1, selected.getRatio(), false))
            return rootNew;
        }
        else {
            var parent = selected.getParent();
            parent.addChild(new tree.RatioNode(1, selected.getRatio(), false));
            return parent;
        }
    });
    var callbackAddTChildClick = callbackEditSelectionDecorator(function (selected) {
        selected.addChild(new tree.RatioNode(0, 1, false));
        if (selected.getNumChildren() === 1) {
            selected.addChild(new tree.RatioNode(0, 1, false));
        }
        return selected;
    });
    var callbackAddFChildClick = callbackEditSelectionDecorator(function (selected) {
        selected.addChild(new tree.RatioNode(1, 1, false));
        if (selected.getNumChildren() === 1) {
            selected.addChild(new tree.RatioNode(1, 1, false));
        }
        return selected;
    });

	/* init */
	var callbackDomReady = function () {
        // init
        shared.init();
        server.init();
		audio.init();
		video.init('justree-ui');
		
		// generate tree
		var root = tree.treeGrow(0, config.depthMin, config.depthMax, config.breadthMax, config.pTerm, config.nDims, config.ratios, config.pOn);
		shared.setNodeRoot(root);
        shared.rescanNodeRootSubtree();

        // modal callbacks
        $('button#hear').on('click', function () {
            shared.modalState = ModalEnum.HEAR;
            $('div#edit').hide();
            $('div#hear').show();
            shared.clearNodeSelected();
            navChildStack = [];
            video.repaint();
        });
        $('button#edit').on('click', function () {
            shared.modalState = ModalEnum.EDIT;
            $('div#hear').hide();
            $('div#edit').show();
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
        $('button#add-t-sibling').on('click', callbackAddTSiblingClick);
        $('button#add-f-sibling').on('click', callbackAddFSiblingClick);
        $('button#add-t-child').on('click', callbackAddTChildClick);
        $('button#add-f-child').on('click', callbackAddFChildClick);

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
        hookAudioParamToSlider(audio.gainParam, '#playback #gain');
        hookAudioParamToSlider(audio.timeLenParam, '#synthesis #time-len');
        hookAudioParamToSlider(audio.freqMinParam, '#synthesis #freq-min');
        hookAudioParamToSlider(audio.freqMaxRatParam, '#synthesis #freq-max-rat');
        $('#effects input[name=reverb]').on('change', callbackReverbToggle);
        callbackReverbToggle();

        // viewport resize callback
		$(window).resize(video.callbackWindowResize);
        video.callbackWindowResize();

        // start animation
		window.requestAnimationFrame(video.animate);
	};
	$(document).ready(callbackDomReady);

})(window.jQuery, window._, window.justree);