# Catalog photography

The catalog photographs and homepage campaign image were generated for this project with the built-in OpenAI image generation tool. No external source photographs or hotlinks are used.

Each product's three photographs originated in a single generated triptych. The panels are stored in `main-website/frontend/public/catalog` as 640 × 800 WebP images with front, back and detail filename suffixes. The campaign image is `main-website/frontend/public/hero.webp`.

## Production prompts

For each entry in `catalog.json`, append its exact `description` to the following prompt.

> Create a precision 12:5 landscape production contact sheet containing exactly THREE equal-width portrait panels 4:5, cut at x=1/3 and 2/3. No borders, gutters, text, labels, props, hangers or models. A catalogue photo shoot of ONE garment on a pure flat warm off-white #F2EEE8 background, soft studio light. LEFT: entire FRONT shown centered floating in a natural, clean ghost mannequin flat lay with ample margin around all edges. MIDDLE: entire BACK of the identical garment centered same scale, identical fabric and colour. RIGHT: extreme macro photograph filling the panel edge-to-edge of actual stitching and fabric detail of that very garment. Premium fashion e-commerce photography. Product: 

The homepage campaign used the following prompt.

> Wide landscape editorial fashion campaign photo, two young adult Indian models in the right half of a sunwashed modern sandstone courtyard, woman in ivory linen sleeveless dress and man in a taupe unbuttoned camp shirt, candid and natural, a relaxed fashion magazine feel, sculptural shadows, clear quiet negative space at left, full bleed, no text. 2:1.
