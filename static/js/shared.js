window.justree = window.justree || {};

(function (justree) {
	var shared = justree.shared = {};

    /* private */
    var nodeRoot = null;
    var leafCellsSorted = [];
    var nodeSelected = null;

    /* exports */
    shared.init = function () {};
    shared.getNodeRoot = function () {
        return nodeRoot;
    };
    shared.setNodeRoot = function(nodeRootNew) {
        nodeRoot = nodeRootNew;
        leafCellsSorted = [];
    };
    shared.parseNodeRoot = function (node, depth, x, y, width, height) {
        if (node === undefined) {
            node = nodeRoot;
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
            leafCellsSorted.push(cell);
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

        leafCellsSorted = [];
        if (subtree !== null) {
            shared.parseNodeRoot();
            // sort by x ascending then y descending
            leafCellsSorted.sort(function (a, b) {
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
            $('#string').html(nodeRoot.toString());
        }
        else {
            $('#string').html('null');
        }
    };
    shared.getNodeRootLeafCellsSorted = function () {
        return leafCellsSorted;
    };
    shared.getNodeSelected = function () {
        return nodeSelected;
    };
    shared.setNodeSelected = function(nodeSelectedNew) {
        nodeSelected = nodeSelectedNew;
    };
    shared.clearNodeSelected = function () {
        nodeSelected = null;
    };
})(window.justree);