function removeProduct() {
    const idx = findProductIndex();
    return idx;
}
function createProduct() {
    const slug = generateSlug();
    return { slug };
}
function findProductIndex() {
    return 0;
}
// FM5: Mutual pairs - fix one creates other. From product-handlers.
// createProduct calls generateSlug; removeProduct calls findProductIndex.
// Order fix for one pair can violate the other.
function generateSlug() {
    return "slug";
}
