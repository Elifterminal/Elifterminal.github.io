// Spatial hash for "is any existing hatch line too close to this point?".
// Streamline growth asks that on every single step, so a linear scan is not an
// option.
//
// Cells are deliberately small and the query scans however many rings the
// radius needs. That keeps the work proportional to the spacing being asked
// about: dense areas ask about a tiny radius and touch a handful of points.
// Sizing cells to the largest possible radius instead would pack hundreds of
// points into every cell and make the dense passes quadratic.

export function createSpatialGrid(width, height, cellSize) {
    const cols = Math.max(1, Math.ceil(width / cellSize));
    const rows = Math.max(1, Math.ceil(height / cellSize));
    const buckets = new Array(cols * rows);

    function insert(point) {
        const col = Math.max(0, Math.min(cols - 1, Math.floor(point.x / cellSize)));
        const row = Math.max(0, Math.min(rows - 1, Math.floor(point.y / cellSize)));
        const index = row * cols + col;

        if (buckets[index] === undefined) buckets[index] = [];
        buckets[index].push(point);
    }

    function insertAll(points) {
        for (const point of points) insert(point);
    }

    function hasNeighborWithin(x, y, radius) {
        const radiusSq = radius * radius;
        const reach = Math.ceil(radius / cellSize);

        const col = Math.floor(x / cellSize);
        const row = Math.floor(y / cellSize);

        const rowStart = Math.max(0, row - reach);
        const rowEnd = Math.min(rows - 1, row + reach);
        const colStart = Math.max(0, col - reach);
        const colEnd = Math.min(cols - 1, col + reach);

        for (let r = rowStart; r <= rowEnd; r++) {
            const base = r * cols;
            for (let c = colStart; c <= colEnd; c++) {
                const bucket = buckets[base + c];
                if (bucket === undefined) continue;

                for (let i = 0; i < bucket.length; i++) {
                    const dx = bucket[i].x - x;
                    const dy = bucket[i].y - y;
                    if (dx * dx + dy * dy < radiusSq) return true;
                }
            }
        }
        return false;
    }

    return { insert, insertAll, hasNeighborWithin, cellSize };
}
