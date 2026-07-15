// The queue strip: thumbnails of everything lined up, current one marked.
// Click a thumb to draw it, x to drop it from the queue.

export function createStrip(container, { onSelect, onRemove }) {
    function thumbnailFor(item) {
        if (item.thumb) return item.thumb;
        return item.src;
    }

    function render(items, currentIndex) {
        container.textContent = '';

        items.forEach((item, index) => {
            const cell = document.createElement('div');
            cell.className = 'thumb' + (index === currentIndex ? ' current' : '');
            cell.title = item.title;

            const img = document.createElement('img');
            img.src = thumbnailFor(item);
            img.alt = item.title;
            img.loading = 'lazy';
            cell.appendChild(img);

            cell.addEventListener('click', () => onSelect(index));

            // Only uploads can be removed; the repo playlist is not ours to edit.
            if (item.storedId !== undefined) {
                const remove = document.createElement('button');
                remove.className = 'thumb-remove';
                remove.textContent = '×';
                remove.title = `Remove ${item.title}`;
                remove.addEventListener('click', (event) => {
                    event.stopPropagation();
                    onRemove(item);
                });
                cell.appendChild(remove);
            }

            container.appendChild(cell);
        });
    }

    return { render };
}
