window.justree = window.justree || {};

(function (ObjectBase, justree) {
	var tree = justree.tree = {};
	
	var RatioNode = tree.RatioNode = ObjectBase.extend({
		constructor: function (dim, ratio, on) {
            this.parent = null;
            this.children = [];
			this.dim = dim;
			this.ratio = ratio;
			this.on = on;
		},
		getCopy: function (parent) {
			if (parent === undefined) {
				parent = null;
			}
			var thisCopy = new RatioNode(this.dim, this.ratio, this.on);
			for (var i = 0; i < this.getNumChildren(); ++i) {
				thisCopy.children.push(this.getChild(i).getCopy(thisCopy));
			}
			thisCopy.parent = parent;
			return thisCopy;
		},
		getChildIdxForChild: function (child) {
			for (var i = 0; i < this.getNumChildren(); ++i) {
				if (this.children === child) {
					return i;
				}
			}
			return -1;
		},
		getChild: function(idx) {
			return this.children[idx];
		},
		setChild: function(idx, child) {
			this.children[idx] = child;
		},
		getChildren: function () {
			return this.children;
		},
		getNumChildren: function () {
			return this.children.length;
		},
		insertChild: function (idx, child) {
			this.children.splice(idx, 0, child)
		},
		rotateChildren: function () {
			if (this.getNumChildren() > 1) {
				var childLast = this.getChild(this.getNumChildren() - 1);
				for (var i = 0; i < this.getNumChildren(); ++i) {
					var child = this.getChild(i);
					this.setChild(i, childLast);
					childLast = child;
				}
			}
		},
        isRoot: function () {
            return this.parent === null;
        },
		isLeaf: function () {
			return this.getNumChildren() === 0;
		},
		toString: function () {
			var string = '(' + String(this.ratio);
			for (var i = 0; i < this.children.length; ++i) {
				string += ' ' + this.children[i].toString();
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
    };

	var treeGrow = tree.treeGrow = function (depthCurr, depthMin, depthMax, breadthMax, pLeaf, nDims, ratios, pOn) {
		//var dim = Math.floor(Math.random() * nDims);
		var dim = depthCurr % 2;
		var ratio = ratios[Math.floor(Math.random() * ratios.length)];
		var on = Math.random() < pOn;
		var node = new RatioNode(dim, ratio, on);

		var p = pLeaf;
		if (depthCurr < depthMin) {
			p = 0.0; 
		}
		else if (depthCurr >= depthMax) {
			p = 1.0;
		}

		if (Math.random() >= p) {
			var childrenNum = 2 + Math.floor(Math.random() * (2 - breadthMax));
			for (var i = 0; i < childrenNum; ++i) {
				var child = treeGrow(depthCurr + 1, depthMin, depthMax, breadthMax, pLeaf, nDims, ratios, pOn);
				child.parent = node;
				node.children.push(child);
			}
		}

		return node;
	};

	var consumeWhiteSpace = function(treeStr) {
		while (treeStr.length > 0) {
			var char = treeStr[0];
			if (!(char === ' ' || char === '\t' || char === '\n')) {
				break;
			}
			treeStr = treeStr.slice(1);
		}
	};

	var consumeToken = function(treeStr, token) {
		if (treeStr.length === 0) {
			throw 'consumeToken: Unexpected end of string.'
		}

		if (treeStr[0] === token) {
			return treeStr.slice(1);
		}
		else {
			throw 'consumeToken: Unexpected token.';
		}
	};

	var nodeParse = tree.nodeParse = function (nodeStr) {
		nodeStr = consumeWhiteSpace(nodeStr);

		// parse open paren
		nodeStr = consumeToken(nodeStr, '(');
		nodeStr = consumeWhiteSpace(nodeStr);

		// parse attrs

		// parse children
		var children = []
		while (nodeStr[0] === '(') {
			var child = treeParse(nodeStr);
			children.append(child.node);
			nodeStr = child.remaining;
			nodeStr = consumeWhiteSpace(nodeStr);
		}

		// parse close paren
		nodeStr = consumeToken(nodeStr, ')');

		return {
			'node': node,
			'remaining': nodeStr
		};
	};

	var treeParse = tree.treeParse = function (treeStr) {
		treeStr = consumeWhiteSpace(treeStr);

		var root = nodeParse(treeStr);
		treeStr = root.remaining;
		root = root.node;

		treeStr = consumeWhiteSpace(treeStr);

		if (treeStr.length > 0) {
			throw 'treeParse: Unexpected token.';
		}

		return root;
	};

})(window.ObjectBase, window.justree);