/**
 * @param {{date: string, id: string}} a
 * @param {{date: string, id: string}} b
 */
export function comparePosts(a, b) {
    if (a.date !== b.date) return a.date > b.date ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
