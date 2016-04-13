window.justree = window.justree || {};

(function (justree) {
	var shared = justree.shared = {};

    var PlayheadStateEnum = shared.PlayheadStateEnum = {
        'STOPPED': 0,
        'PLAYING': 1,
        'LOOPING': 2
    };
    var ModalEnum = shared.ModalEnum = {
        'HEAR': 0,
        'EDIT': 1,
        'SHARE': 2,
        'SERVER': 3
    };
    shared.init = function () {
        shared.playheadState = PlayheadStateEnum.STOPPED;
        shared.playheadPosRel = 0.0;
        shared.nodeClipboard = null;
        shared.nodeRoot = null;
        shared.nodeSelected = null;
        shared.leafCellsSorted = [];
        shared.undoStack = [];
        shared.undoStackIdx = 0;
        shared.modalState = ModalEnum.EDIT;
    };
    shared.clearNodeClipboard = function () {
        shared.nodeClipboard = null;
    };
    shared.pushNodeClipboard = function (node) {
        shared.nodeClipboard = node;
    };
    shared.peekNodeClipboard = function () {
        return shared.nodeClipboard;
    };
    shared.undoDebugPrint = function () {
        console.log('-------');
        for (var i = 0; i < shared.undoStack.length; ++i) {
            var str = String(i);
            if (i === shared.undoStackIdx) {
                str += '->';
            }
            else {
                str += '  ';
            }
            var node = shared.undoStack[i];
            if (node === null) {
                str += 'null';
            }
            else {
                str += node.toString();
            }
            console.log(str);
        }
    };
    shared.undoStackPushChange = function (node) {
        // if we've branched, delete everything 
        while (shared.undoStackIdx < shared.undoStack.length) {
            shared.undoStack.pop();
        }
        if (shared.undoStack.length < shared.undoStackIdx) {
            shared.undoStack.push(node);
        }
        else {
            shared.undoStack[shared.undoStackIdx] = node;
        }
        shared.undoStackIdx += 1;
    };
    shared.undoStackUndo = function (node) {
        if (shared.undoStackIdx === 0) {
            return null;
        }
        if (shared.undoStackIdx === shared.undoStack.length) {
            shared.undoStack.push(node);
        }
        var result = shared.undoStack[shared.undoStackIdx - 1];
        shared.undoStackIdx -= 1;
        return result;
    };
    shared.undoStackRedo = function () {
        if (shared.undoStackIdx + 1 < shared.undoStack.length) {
            var result = shared.undoStack[shared.undoStackIdx + 1];
            shared.undoStackIdx += 1;
            return result;
        }
        return null;
    };
    shared.getNodeSelected = function () {
        return shared.nodeSelected;
    };
    shared.setNodeSelected = function(nodeSelected) {
        shared.nodeSelected = nodeSelected;
    };
    shared.clearNodeSelected = function () {
        shared.nodeSelected = null;
    };
    shared.getNodeRoot = function () {
        return shared.nodeRoot;
    };
    shared.setNodeRoot = function(nodeRoot) {
        shared.nodeRoot = nodeRoot;
        shared.leafCellsSorted = [];
    };
    shared.parseNodeRoot = function (node, depth, x, y, width, height) {
        if (node === undefined) {
            node = shared.nodeRoot;
            x = 0.0;
            y = 0.0;
            width = 1.0;
            height = 1.0;
        }

        var cell = {
            'node': node,
            'x': x,
            'y': y,
            'width': width,
            'height': height
        };
        node.cell = cell;

        if (node.isLeaf()) {
            shared.leafCellsSorted.push(cell);
        }
        else {
            var children = node.getChildren();
            var ratioSum = 0.0;
            for (var i = 0; i < children.length; ++i) {
                ratioSum += children[i].ratio;
            }
            var ratioSumInverse = 1.0 / ratioSum;
            if (node.dim === 0) {
                var offsetX = x;
                for (var i = 0; i < children.length; ++i) {
                    var child = children[i];
                    var childWidth = child.ratio * ratioSumInverse * width;
                    shared.parseNodeRoot(children[i], depth + 1, offsetX, y, childWidth, height);
                    offsetX += childWidth;
                }
            }
            else {
                var offsetY = y;
                for (var i = 0; i < children.length; ++i) {
                    var child = children[i];
                    var childHeight = child.ratio * ratioSumInverse * height;
                    shared.parseNodeRoot(children[i], depth + 1, x, offsetY, width, childHeight);
                    offsetY += childHeight;
                }
            }
        }
    };
    shared.rescanNodeRootSubtree = function (subtree) {
        subtree = subtree !== undefined ? subtree : shared.getNodeRoot();

        shared.leafCellsSorted = [];
        if (subtree !== null) {
            shared.parseNodeRoot();
            // sort by x ascending then y descending
            shared.leafCellsSorted.sort(function (a, b) {
                var aX = a[2];
                var aY = a[3];
                var bX = b[2];
                var bY = b[3];
                if (aX != bX) {
                    return aX - bX;
                }
                else {
                    return bY - aY;
                }
            });
            $('#string').html(shared.nodeRoot.toString());
        }
        else {
            $('#string').html('null');
        }
    };
    shared.getLeafCellsSorted = function () {
        return shared.leafCellsSorted;
    };
})(window.justree);