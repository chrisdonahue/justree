window.justree = window.justree || {};

(function (ObjectBase, justree) {
	var tree = justree.tree = {};
	
	var RatioNode = tree.RatioNode = ObjectBase.extend({
		constructor: function (dim, ratio, on) {
            this.parent = null;
			this.left = null;
			this.right = null;
			this.dim = dim;
			this.ratio = ratio;
			this.on = on;
		},
        isRoot: function () {
            return this.parent === null;
        },
		isLeaf: function () {
			return this.left === null && this.right === null;
		},
		toString: function () {
			var string = '(' + String(this.ratio);
			if (this.left !== null) {
				string += ' ' + this.left.toString();
			}
			if (this.right !== null) {
				string += ' ' + this.right.toString();
			}
			string += ')';
			return string;
		}
	});
    var swapSubTrees = function (subtree0, subtree1) {
        subtree0Parent = subtree0.parent;
        subtree1Parent = subtree1.parent;

        // move 1 to place of 0
        if (subtree0Parent !== null) {
            if (subtree0Parent.left === subtree0) {
                subtree0Parent.left = subtree1;
                subtree1.parent = subtree0Parent;   
            }
            else {
                subtree0Parent.right = subtree1;
                subtree1.parent = subtree1Parent;
            }
        }
        else {
            subtree1.parent = null;
        }

        // TODO: finish lol
    };
	var treeGrow = tree.treeGrow = function (depthCurr, depthMin, depthMax, pTerm, nDims, ratios, pOn) {
		//var dim = Math.floor(Math.random() * nDims);
		var dim = depthCurr % 2;
		var ratio = config.ratios[Math.floor(Math.random() * config.ratiosLen)];
		var on = Math.random() < pOn;
		var node = new RatioNode(dim, ratio, on);

		var p = pTerm;
		if (depthCurr < depthMin) {
			p = 0.0;
		}
		else if (depthCurr >= depthMax) {
			p = 1.0;
		}

		if (Math.random() >= p) {
			node.left = treeGrow(depthCurr + 1, depthMin, depthMax, pTerm, nDims, ratios, pOn);
			node.right = treeGrow(depthCurr + 1, depthMin, depthMax, pTerm, nDims, ratios, pOn);
            node.left.parent = node;
            node.right.parent = node;
		}

		return node;
	};
	var treeFull = tree.treeFull = function (depth, depthCurr) {
		var on = Math.random() < pOn;
		var weight = config.ratios[Math.floor(Math.random() * config.ratiosLen)];
		var node = new Node(weight, on);

		if (depthCurr < depth) {
			node.left = treeFull(depth, depthCurr + 1);
			node.right = treeFull(depth, depthCurr + 1);
		}
		else {
			node.left = null;
			node.right = null;
		}

		return node;
	};
})(window.ObjectBase, window.justree);