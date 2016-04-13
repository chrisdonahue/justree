window.justree = window.justree || {};

(function (ObjectBase, justree) {
	var tree = justree.tree = {};

	var RatioNode = tree.RatioNode = ObjectBase.extend({
		constructor: function (dim, ratio, velocity) {
            this.parent = null;
            this.children = [];
			this.dim = dim;
			this.ratio = ratio;
			this.velocity = velocity;
		},
		getDim: function () {
			return this.dim;
		},
		setDim: function (dim) {
			this.dim = dim;
		},
		getRatio: function () {
			return this.ratio;
		},
		setRatio: function (ratio) {
			this.ratio = ratio;
		},
		getVelocity: function () {
			return this.velocity;
		},
		setVelocity: function (velocity) {
			this.velocity = velocity;
		},
		getDepth: function () {
			depth = 0;
			nodeCurr = this;
			while (nodeCurr.parent !== null) {
				nodeCurr = nodeCurr.parent
				depth++;
			}
			return depth;
		},
		getCopy: function (parent) {
			if (parent === undefined) {
				parent = null;
			}
			var thisCopy = new RatioNode(this.dim, this.ratio, this.on);
			for (var i = 0; i < this.getNumChildren(); ++i) {
				thisCopy.addChild(this.getChild(i).getCopy(thisCopy));
			}
			return thisCopy;
		},
		isSane: function (parent) {
			if (parent === undefined) {
				parent = null;
			}
			var sane = true;
			for (var i = 0; i < this.getNumChildren(); ++i) {
				sane = sane && this.getChild(i).getParent() === this;
				sane = sane && this.getChild(i).isSane(this);
			}
			return sane;
		},
		getChildIdxForChild: function (child) {
			for (var i = 0; i < this.getNumChildren(); ++i) {
				if (this.getChild(i) === child) {
					return i;
				}
			}
			return -1;
		},
		getChild: function(idx) {
			return this.children[idx];
		},
		getRandomChild: function() {
			var numChildren = this.getNumChildren();
			if (numChildren > 0) {
				return this.getChild(Math.floor(Math.random() * numChildren));
			}
			else {
				return null;
			}
		},
		setChild: function(idx, child) {
			this.children[idx] = child;
			child.parent = this;
		},
		insertChild: function (idx, child) {
			this.children.splice(idx, 0, child)
			child.parent = this;
		},
		addChild: function(child) {
			this.children.push(child);
			child.parent = this;
		},
		swapChildren: function (childIdx0, childIdx1) {
			var childTemporary = this.getChild(childIdx0);
			this.setChild(childIdx0, this.getChild(childIdx1));
			this.setChild(childIdx1, childTemporary);
		},
		moveChildLeft: function (childIdx) {
			var numChildren = this.getNumChildren();
			if (numChildren > 1) {
				var childIdxSwap = modPls(childIdx - 1, numChildren);
				this.swapChildren(childIdx, childIdxSwap);
			}
		},
		moveChildRight: function (childIdx) {
			var numChildren = this.getNumChildren();
			if (numChildren > 1) {
				var childIdxSwap = modPls(childIdx + 1, numChildren);
				this.swapChildren(childIdx, childIdxSwap);
			}
		},
		deleteChild: function (childIdx) {
			this.children.splice(childIdx, 1);
		},
		deleteChildren: function () {
			this.children = [];
		},
		rotateChildrenLeft: function () {
			if (this.getNumChildren() > 1) {
				var childLast = this.getChild(0);
				for (var i = this.getNumChildren() - 1; i >= 0; --i) {
					var child = this.getChild(i);
					this.setChild(i, childLast);
					childLast = child;
				}
			}
		},
		rotateChildrenRight: function () {
			if (this.getNumChildren() > 1) {
				var childLast = this.getChild(this.getNumChildren() - 1);
				for (var i = 0; i < this.getNumChildren(); ++i) {
					var child = this.getChild(i);
					this.setChild(i, childLast);
					childLast = child;
				}
			}
		},
		getParent: function () {
			return this.parent;
		},
		emancipate: function () {
			this.parent = null;
		},
		getChildren: function () {
			return this.children;
		},
		getNumChildren: function () {
			return this.children.length;
		},
        isRoot: function () {
            return this.parent === null;
        },
		isLeaf: function () {
			return this.getNumChildren() === 0;
		},
		getChildrenRatioSum: function () {
			var ratioSum = 0;
			for (var i = 0; i < this.getNumChildren(); ++i) {
				ratioSum += this.getChild(i).getRatio();
			}
			return ratioSum;
		},
		forEachChild: function (fun) {
			for (var i = 0; i < this.getNumChildren(); ++i) {
				fun(this.getChild(i));
			}
		},
		toString: function () {
			var velocity = this.on ? 1.0 : 0.0;
			var string = '(' + String(this.getDim()) + ' ' + String(this.getRatio()) + ' ' + String(this.getVelocity());
			for (var i = 0; i < this.getNumChildren(); ++i) {
				string += ' ' + this.getChild(i).toString();
			}
			string += ')';
			return string;
		}
	});

	var replaceSubtree = tree.replaceSubtree = function (subtreeOld, subtreeNew) {
		if (subtreeOld.isRoot()) {
			subtreeNew.emancipate();
		}
		else {
			var subtreeOldParent = subtreeOld.getParent();
			var childIdx = subtreeOldParent.getChildIdxForChild(subtreeOld);
			subtreeOldParent.setChild(childIdx, subtreeNew);
		}
	};

	/*
    var swapSubTrees = tree.swapSubTrees = function (subtree0, subtree1) {
    	if (subtree0 )
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
    */

	var treeGrow = tree.treeGrow = function (depthCurr, depthMin, depthMax, breadthMax, pLeaf, nDims, ratios, pOn) {
		//var dim = Math.floor(Math.random() * nDims);
		var dim = depthCurr % 2;
		var ratio = ratios[Math.floor(Math.random() * ratios.length)];
		var velocity = Math.random() < pOn ? 1.0 : 0.0;
		var node = new RatioNode(dim, ratio, velocity);

		var p = pLeaf;
		if (depthCurr < depthMin) {
			p = 0.0; 
		}
		else if (depthCurr >= depthMax) {
			p = 1.0;
		}

		if (Math.random() >= p) {
			var childrenNum = 2 + Math.floor(Math.random() * (breadthMax - 1));
			for (var i = 0; i < childrenNum; ++i) {
				var child = treeGrow(depthCurr + 1, depthMin, depthMax, breadthMax, pLeaf, nDims, ratios, pOn);
				child.parent = node;
				node.children.push(child);
			}
		}

		return node;
	};

	var consumeToken = function(tokens, expectedToken) {
		if (tokens.length === 0) {
			throw 'consumeToken: Unexpected end of string.'
		}

		if (tokens[0] === expectedToken) {
			tokens.splice(0, 1);
		}
		else {
			throw 'consumeToken: Unexpected token.';
		}
	};

	var parseNumber = function(tokens) {
		if (tokens.length === 0) {
			throw 'consumeToken: Unexpected end of string.'
		}

		var float = parseFloat(tokens[0]);
		tokens.splice(0, 1);
		if (isNaN(float)) {
			throw 'consumeNumber: Invalid number.'
		}
		return float;
	};

	var nodeParse = tree.nodeParse = function (tokens) {
		// parse open paren
		consumeToken(tokens, '(');

		// parse attrs
		var nodeNew = new RatioNode(parseNumber(tokens), parseNumber(tokens), parseNumber(tokens));

		// parse children
		while (tokens.length > 0 && tokens[0] === '(') {
			nodeNew.addChild(nodeParse(tokens));
		}

		// parse close paren
		consumeToken(tokens, ')');

		return nodeNew;
	};

	var tokenize = function(input) {
		return input.replace(/\(/g, ' ( ')
			.replace(/\)/g, ' ) ')
			.trim()
			.split(/\s+/);
	};

	var treeParse = tree.treeParse = function (treeStr) {
		var tokens = tokenize(treeStr);

		var nodeRoot = nodeParse(tokens);

		if (tokens.length > 0) {
			throw 'treeParse: Unexpected token.';
		}

		return nodeRoot;
	};

})(window.ObjectBase, window.justree);