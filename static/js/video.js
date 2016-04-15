window.justree = window.justree || {};

(function (justree) {
    var config = justree.config;
	var shared = justree.shared;
    var clock = justree.clock;

	var video = justree.video = {};

	var rgbToString = video.rgbToString = function (rgb) {
		return 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
	};
	var hueToRgb = video.hueToRgb = function (p, q, t) {
        if(t < 0) t += 1;
        if(t > 1) t -= 1;
        if(t < 1/6) return p + (q - p) * 6 * t;
        if(t < 1/2) return q;
        if(t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
	};
	var hslToRgb = video.hslToRgb = function (hsl) {
		var h = hsl[0];
		var s = hsl[1];
		var l = hsl[2];
	    var r, g, b;

	    if (s == 0) {
	        r = g = b = l; // achromatic
	    } else {
	        var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
	        var p = 2 * l - q;
	        r = hueToRgb(p, q, h + 1/3);
	        g = hueToRgb(p, q, h);
	        b = hueToRgb(p, q, h - 1/3);
	    }

	    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
	};

    var canvasWidth = -1;
    var canvasHeight = -1;
    var canvasDom = null;
    var canvasDomCtx = null;
    var canvasBuffer = document.createElement('canvas');
    var canvasBufferCtx = canvasBuffer.getContext('2d');
	video.init = function (canvasDomElement) {
        canvasDom = canvasDomElement;
        canvasDomCtx = canvasDom.getContext('2d');
	};
	video.canvasResize = function (canvasWidthNew, canvasHeightNew) {
        canvasWidth = canvasWidthNew;
        canvasHeight = canvasHeightNew;
        canvasDom.width = canvasWidth;
        canvasDom.height = canvasHeight;
        canvasBuffer.width = canvasWidth;
        canvasBuffer.height = canvasHeight;
        video.repaintBuffer();
        video.repaintDom();
	};
    video.posAbsToLeafNode = function (x, y) {
        var width = canvasWidth;
        var height = canvasHeight;
        var leafCellsSorted = shared.getNodeRootLeafCellsSorted();
        for (var i = 0; i < leafCellsSorted.length; ++i) {
            var cell = leafCellsSorted[i];
            var cellX = cell.x * width;
            var cellY = cell.y * height;
            var cellWidth = cell.width * width;
            var cellHeight = cell.height * height;
            if (cellX <= x && x <= cellX + cellWidth &&
                cellY <= y && y <= cellY + cellHeight) {
                return cell.node;
            }
        }
        return null;
    };
	video.animate = function () {
		video.repaintDom();
		window.requestAnimationFrame(video.animate);
	};
    video.repaintFull = function () {
        video.repaintBuffer();
        video.repaintDom();
    };

    var relToAbsBb = function (relBb) {
        return {
            'x': relBb.x * canvasWidth,
            'y': relBb.y * canvasHeight,
            'width': relBb.width * canvasWidth,
            'height': relBb.height * canvasHeight
        };
    };
    video.repaintBuffer = function () {
        var ctx = canvasBufferCtx;

        // clear
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);

        // draw treemap
        var leafCellsSorted = shared.getNodeRootLeafCellsSorted();
        for (var i = 0; i < leafCellsSorted.length; ++i) {
            var cell = leafCellsSorted[i];
            var cellAbsBb = relToAbsBb(cell);
            ctx.fillStyle = 'rgb(25, 25, 25)';
            ctx.fillRect(cellAbsBb.x, cellAbsBb.y, cellAbsBb.width, cellAbsBb.height);
            ctx.strokeStyle = 'rgb(0, 255, 255)';
            ctx.strokeRect(cellAbsBb.x, cellAbsBb.y, cellAbsBb.width, cellAbsBb.height);
        }
    };
	video.repaintDom = function () {
        var ctx = canvasDomCtx;

        // copy from buffer
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        ctx.drawImage(canvasBuffer, 0, 0);

        // draw velocities
        var leafCellsSorted = shared.getNodeRootLeafCellsSorted();
        for (var i = 0; i < leafCellsSorted.length; ++i) {
            var cell = leafCellsSorted[i];
            if (cell.node.getVelocity() <= 0.0) {
                continue;
            }

            var cellAbsBb = relToAbsBb(cell);
            ctx.fillStyle = 'rgb(200, 200, 200)';
            ctx.fillRect(cellAbsBb.x, cellAbsBb.y, cellAbsBb.width, cellAbsBb.height);
            ctx.strokeStyle = 'rgb(0, 255, 255)';
            ctx.strokeRect(cellAbsBb.x, cellAbsBb.y, cellAbsBb.width, cellAbsBb.height);
        }

        // draw selected
        var nodeSelected = shared.getNodeSelected();
        if (nodeSelected !== null) {
            var cellSelected = nodeSelected.cell;
            var cellAbsBb = relToAbsBb(cellSelected);
            ctx.fillStyle = 'rgba(255, 0, 100, 0.5)';
            ctx.fillRect(cellAbsBb.x, cellAbsBb.y, cellAbsBb.width, cellAbsBb.height);
        }

        // draw playback line
        var clockPosRel = clock.getPosRel();
        if (clockPosRel >= 0.0) {
            ctx.strokeStyle = 'rgb(255, 0, 0)';
            ctx.beginPath();
            var playheadX = clockPosRel * canvasWidth;
            ctx.moveTo(playheadX, 0);
            ctx.lineTo(playheadX, canvasHeight);
            ctx.stroke();
        }
	};
})(window.justree);