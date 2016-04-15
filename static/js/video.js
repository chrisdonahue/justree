window.justree = window.justree || {};

(function (justree) {
    var config = justree.config;
	var shared = justree.shared;
    var clock = justree.clock;

	var video = justree.video = {};
    var OrientationEnum = video.OrientationEnum = {
    	'PORTRAIT': 0,
    	'LANDSCAPE': 1
    };
	video.orientationGet = function (width, height) {
		return width > height ? OrientationEnum.LANDSCAPE : OrientationEnum.PORTRAIT;
	};
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
	video.init = function (canvasId) {
		video.canvas = $('#justree-ui').get(0);
		video.canvasCtx = video.canvas.getContext('2d');
		video.viewportWidth = -1;
		video.viewportHeight = -1;
		video.canvasWidth = -1;
		video.canvasHeight = -1;
        video.zoomCell = null;
        //clock.registerCallback(video.repaint);
	};
	video.callbackWindowResize = function () {
		var viewportWidth = $(window).width();
		var viewportHeight = $(window).height();
		if (viewportWidth !== video.viewportWidth || viewportHeight !== video.viewportHeight) {
			video.viewportHeight = viewportWidth;
			video.viewportWidth = viewportHeight;
			video.canvasWidth = video.canvas.width;
			video.canvasHeight = video.canvas.height;
			video.repaint();
		}
	};
    video.posAbsToLeafNode = function (x, y) {
        var width = video.canvasWidth;
        var height = video.canvasHeight;
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

    video.setZoomCell = function (cell) {
        video.zoomCell = cell;
    };
	video.animate = function () {
		video.repaint();
		window.requestAnimationFrame(video.animate);
	};
	video.repaint = function () {
		var ctx = video.canvasCtx;
		var canvasWidth = video.canvasWidth;
		var canvasHeight = video.canvasHeight;
        var zoomCell = video.zoomCell;
        var zoomBb;
        if (zoomCell === null) {
            zoomBb = {
                'x': 0.0,
                'y': 0.0,
                'width': 1.0,
                'height': 1.0
            };
        }
        else {
            zoomBb = zoomCell;
        }

        var relBbToAbsBb = function (relBb) {
            var x0 = (relBb.x - zoomBb.x) * canvasWidth;
            var y0 = (relBb.y - zoomBb.y) * canvasHeight;
            var x1 = ((relBb.x + relBb.width) - zoomBb.x) * canvasWidth;
            var y1 = ((relBb.y + relBb.height) - zoomBb.y) * canvasHeight;
            return {
                'x': x0,
                'y': y0,
                'width': x1 - x0,
                'height': y1 - y0
            }
        };

        // clear
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);

        // draw treemap
        var leafCellsSorted = shared.getNodeRootLeafCellsSorted();
		for (var i = 0; i < leafCellsSorted.length; ++i) {
			var cell = leafCellsSorted[i];
            var absBb = relBbToAbsBb(cell);
            if (cell.node.getVelocity() > 0.0) {
                ctx.fillStyle = 'rgb(200, 200, 200)';
            }
            else {
                ctx.fillStyle = 'rgb(25, 25, 25)';
            }
            ctx.fillRect(absBb.x, absBb.y, absBb.width, absBb.height);
            ctx.strokeStyle = 'rgb(0, 255, 255)';
            ctx.rect(absBb.x, absBb.y, absBb.width, absBb.height);
            ctx.stroke();
		}

        // draw selected
        var nodeSelected = shared.getNodeSelected();
        if (nodeSelected !== null) {
            var cellSelected = nodeSelected.cell;
            ctx.fillStyle = 'rgba(255, 0, 100, 0.5)';
            var absBb = relBbToAbsBb(cellSelected);
            ctx.fillRect(absBb.x, absBb.y, absBb.width, absBb.height);
        }

        // draw playback line
        var clockPosRel = clock.getPosRel();
        if (clockPosRel >= 0.0) {
            ctx.strokeStyle = 'rgb(255, 0, 0)';
            ctx.beginPath();
            var playheadX = relBbToAbsBb({'x': clockPosRel}).x;
            ctx.moveTo(playheadX, 0);
            ctx.lineTo(playheadX, canvasHeight);
            ctx.stroke();
        }
	};
})(window.justree);