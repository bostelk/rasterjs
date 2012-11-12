// clear the pixel buffer.
function cls(buffer, colour) {
    for (var y=0; y < canvasHeight; y++) {
        for (var x=0; x < canvasWidth; x++) {
            setPixel(buffer, x, y, colour);
        }
    }
}

// colour is in rgba format of 4-bytes, 1 byte per component. an alpha of 255 is fully opaque.
function setPixel(buffer, x, y, colour) {
    // 0xff000000:
    var index = Math.floor((x + y * canvasWidth) * 4);
    buffer[index] = colour >> 24 & 0xff;
    buffer[++index] = colour >> 16 & 0xff;
    buffer[++index] = colour >> 8 & 0xff;
    buffer[++index] = colour & 0xff;
}

// first attempt, doesn't handle verticle lines; delta x is zero.
function drawLine(buffer, x1, y1, x2, y2, colour) {
    var m = (y2 - y1) / (x2 - x1);
    for (var x = x1; x < x2; x++) {
        y1 = y1 + m;
        setPixel(buffer, x, y1, colour);
    }
}

// bressenhams line approx
function drawLineBessenham(buffer, x1, y1, x2, y2, colour) {
    var m = Math.abs((y2 - y1) / (x2 - x1));
    var error = 0.0;
    var y = y1;
    for (var x = x1; x < x2; x++) {
        setPixel(buffer, x, y, colour);
        error = error + m;
        if (error >= 0.5) {
            y = y + 1;
            error = error - 1.0;
        }
    }
}

// bressenhams line approx with simplification of opt
function drawLineBressenhamSimple(buffer, x1, y1, x2, y2, colour) {
    var dx = Math.abs(x2 - x1);
    var dy = Math.abs(y2 - y1);
    var sx, sy;
    if (x1 < x2) {
        sx = 1;
    } else {
        sx = -1;
    }
    if (y1 < y2) {
        sy = 1;
    } else {
        sy = -1;
    }
    var err = dx - dy;
    while (x1 !== x2 && y1 !== y2) {
        setPixel(buffer, x1, y1, colour);
        var e2 = 2 * err;
        if (e2 > -dy) {
            err = err - dy;
            x1 = x1 + sx;
        }
        if (e2 < dx) {
            err = err + dx;
            y1 = y1 + sy;
        }
    }
}

// the pixel buffer, the width in pixels, the height in pixels.
function Rasterizer(buffer, width, height) {
    this.buffer = buffer;
    this.width = width;
    this.height = height;
    this.polygons = [];
    /** the active edge list */
    this.ael = [];
    /** the edge table */
    this.et = [];
    this.et.length = height;

    this.init = function() {
        this.et.length = 0;
        this.ael.length = 0;
    };
    this.setPixel = function(x, colour) {
        setPixel(buffer, x, y, colour);
    };
    // writes the horizontal pixels of the scanline.
    this.writeline = function(row) {
        // add all edge records for this scanline to ael.
        var curEr = this.et[row];
        while (curEr !== null && curEr !== undefined) {
            this.ael.push(curEr.clone());
            curEr = curEr.next;
        }
        // raster active edges.
        if (this.ael.length > 0) {
            // sort the ael by edge x-intersections.
            this.ael.sort(this.sortAel);
            // loop over each pixel in the scanline.
            for (var x = 0; x < this.width; x++) {
                for (var i = 0; i < this.ael.length; i++) {
                    var edge = this.ael[i];
                    // spanning.
                    if ((edge.isHorizontal() && x >= Math.min(edge.xint, edge.x2) && x < Math.max(edge.xint, edge.x2)) || edge.xint === x) {
                        setPixel(this.buffer, x, row, 0xff0000ff);
                    }
                }
            }
        }
        // update the active edge list; increment x-intersection and remove edges that we've past.
        for (var i = 0; i < this.ael.length; i++) {
            var edge = this.ael[i];
            if (row >= edge.ymax) {
                this.ael.splice(i, 1);
            } else {
                edge.xint += edge.xinc;
            }
        }
    };
    this.raster = function() {
        // loop over each scanline.
        for (var row = 0; row < this.height; row++){
            this.writeline(row);
        }
    };
    this.addPolygon = function(polygon) {
        this.polygons.push(polygon);
        // update edge table.
        this.process(polygon);
    };
    this.process = function(polygon) {
        // first compute edges.
        polygon.process();
        // now create the edge table
        for (i = 0; i < polygon.edges.length; i++) {
            var edge = polygon.edges[i];
            var ymin = Math.min(edge[1], edge[3]);
            var ymax = Math.max(edge[1], edge[3]);
            /** x-value that lies on the bucket's y-min. */
            var xint = (edge[1] <= edge[3]) ? edge[0] : edge[2];
            var xinc = (edge[2] - edge[0]) / (edge[3] - edge[1]);
            if (this.et[ymin] === undefined) {
                this.et[ymin] = new EdgeRecord(ymax, xint, xinc, null);
                // supplementary information for spanning.
                this.et[ymin].y2 = ymin;
                this.et[ymin].x2 = (xint === edge[0]) ? edge[2] : edge[0];
            } else {
                // find the last edge in the list.
                var nextedge = this.et[ymin];
                while(nextedge.next != null) {
                    nextedge = nextedge.next;
                }
                nextedge.next = new EdgeRecord(ymax, xint, xinc, null);
                // supplementary information for spanning.
                nextedge.next.y2 = ymin;
                nextedge.next.x2 = (xint === edge[0]) ? edge[2] : edge[0];

            }
        }
    };
    this.sortAel = function(e1, e2) {
        return e1.xint - e2.xint;
    };
}

function Polygon() {
    this.points = [];
    this.edges = [];

    this.addVertex = function(x, y) {
        this.points.push([x, y]);
    };
    this.process = function() {
        this.edges.length = 0;
        // find all edges.
        for (var i = 0; i < this.points.length; i++) {
            var p1 = this.points[i];
            var p2 = this.points[(i + 1) % this.points.length];
            this.edges.push([p1[0], p1[1], p2[0], p2[1]]);
        }
        // sort edges by x1; edges are now in order of increasing x1.
        this.edges.sort(this.sortEdge);
    };
    this.sortEdge = function(e1, e2) {
        return e1[0] - e2[0];
    };
}

// an entry in the edge table.
function EdgeRecord(ymax, xint, xinc, next) {
    this.ymax = ymax;
    this.xint = xint;
    this.xinc = xinc;
    this.next = next;
    // only clones the data, ie. loses the list structure.
    this.clone = function() {
        var e = new EdgeRecord(this.ymax, this.xint, this.xinc, null);
        // supp info.
        e.y2 = this.y2;
        e.x2 = this.x2;
        return e;
    };
    // supplementary information for spanning.
    this.y2 = 0;
    this.x2 = 0;
    this.isHorizontal = function() {
        return (this.y2 - this.ymax) === 0;
    };
}

