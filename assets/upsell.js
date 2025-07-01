// Function to create HTML for upsell
function createUpsellHTML(item) {
    return `
        <div class="checkout_upsell" style="margin:0 0 20px 0;">
            <div class="checkout_upsell--item is-image">
                <div class="checkout_upsell--inner">
                    <div class="checkout_upsell--content">
                        <img src="${item.image}" height="100px" width="100px">
                    </div>
                </div>
            </div>
            <div class="checkout_upsell--item is-description">
                <div class="checkout_upsell--inner">
                    <div class="checkout_upsell--content">
                        <div class="checkout_upsell--header" style="justify-content: space-between;">
                            <div class="checkout_upsell--title">
                                ${item.title}<br>
                                ${
                                    item.originalPrice > item.price
                                        ? `<span style="text-decoration: line-through; color: #ccc;">${item.originalPrice}</span><span style="font-weight: bold; margin-left: 8px;">${item.price}</span>`
                                        : `<span style="font-weight: bold;">${item.price}</span>`
                                }
                                
                            </div>
                            ${
                                item.discountValue > 0
                                    ? `<div class="checkout_upsell--tag"><span class="tag tag-success upsell-value">Save ${item.discountAmount}</span></div>`
                                    : ''
                            }
                        </div>
                        <div class="checkout_upsell--desc">${item.subHeading}</div>
                    </div>
                </div>
            </div>
            <div class="checkout_upsell--item is-action">
                <div class="checkout_upsell--inner">
                    <div class="checkout_upsell--content">
                        <button class="button button-upsell" id="addUpsellButton-${item.productPk}">
                            ${item.ctaText}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Generic function to call storefront API
function storefrontAPI(query, variables) {
    return fetch('/api/graphql/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables })
    }).then(res => res.json());
}

// Format to global ID
function toGlobalId(type, id) {
    var globalId = btoa(`${type}:${id}`);
    return globalId;
}

// Function to get cart
function getCart() {
    const query = `mutation {
        createCart(input: {}) {
            cart {
                id
                lines {
                    pk
                    isUpsell
                    product { pk structure parent { pk } }
                }
            }
            success errors
        }
    }`;
    return storefrontAPI(query, {});
}

function getProduct(productID) {
    const query = `query getProduct($productID: ID!) {
        product(id: $productID) {
            title
            purchaseInfo {
                price {
                    currency
                    value
                    format
                }
            }
            images {
                url
            }
        }
    }`;
    const variables = { productID };
    return storefrontAPI(query, variables);
}

// Function to add upsell to cart
function addUpsell(productId, productQty, cartId) {
    const query = `mutation addCartLines($input: AddCartLinesInput!) {
        addCartLines(input: $input) {
            cart { id totalExclTax numLines numItems }
            success errors
        }
    }`;
    const variables = { input: { cartId, lines: [{ productPk: productId, quantity: productQty, isUpsell: true }] } };
    return storefrontAPI(query, variables);
}

// Function to add voucher to cart
function addVoucher(cartId, voucher) {
    const query = `mutation addVoucher($input: AddVoucherInput!) {
        addVoucher(input: $input) {
            success errors
        }
    }`;
    const variables = { input: { cartId, vouchers: [voucher] } };
    return storefrontAPI(query, variables);
}

// Function to update cart attribution (example - optional if you want to assign custom attribution data)
function updateCartAttribution(cartId) {
    const query = `mutation updateCartAttribution($input: UpdateCartAttributionInput!) {
        updateCartAttribution(input: $input) {
            cart { id attribution { metadata } }
            success errors
        }
    }`;
    const variables = { input: { cartId, attribution: { metadata: { checkoutUpsellTaken: true } } } };
    return storefrontAPI(query, variables);
}

// Process upsell on button click
async function processUpsell(event) {
    const addUpsellButton = event.target;
    addUpsellButton.innerText = 'Adding...';
    const cartId = localStorage.getItem('cartID');
    const upSellData = JSON.parse(localStorage.getItem('upSellItem'));

    try {
        let result = await addUpsell(upSellData.productPk, upSellData.productQty, cartId);
        if (result.errors) throw result.errors;

        if (upSellData.discountCoupon) {
            result = await addVoucher(cartId, upSellData.discountCoupon);
            if (result.errors) throw result.errors;
        }

        result = await updateCartAttribution(cartId);
        if (result.errors) throw result.errors;

        location.reload();
    } catch (error) {
        console.error('Error processing upsell:', error);
        addUpsellButton.innerText = 'Add to Cart';
    }
}

function formatCurrency(amount, currency) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

// Select upsell product based on cart content
async function selectUpsellProduct(cartLines, cartProductIds) {
    const unsellItemData = upsellItemData.find(
        item => cartProductIds.includes(item.triggerProductId) &&
        !cartLines.some(line => line.product.pk === item.productPk)
    ) || null;

    if (!unsellItemData) return null;

    const result = await getProduct(toGlobalId('ProductNode', unsellItemData.productPk));
    const productNode = result.data.product;
    const originalPrice = productNode.purchaseInfo.price.value;
    const currency = productNode.purchaseInfo.price.currency;
    const discountedPrice = originalPrice - (unsellItemData.discountValue || 0);

    unsellItemData.image = productNode.images[0].url;
    unsellItemData.title = productNode.title;
    unsellItemData.price = formatCurrency(discountedPrice, currency);
    unsellItemData.originalPrice = formatCurrency(originalPrice, currency);
    unsellItemData.discountAmount = formatCurrency(unsellItemData.discountValue, currency);

    return unsellItemData;
   
}

// Show upsell if conditions are met
function showUpsell() {
    var checkoutFormContent = document.querySelector('main.checkout_steps--main-content');
    
    getCart().then(async result => {  
        const cartId = result.data.createCart.cart.id;
        localStorage.setItem('cartID', cartId);
        const cartLines = result.data.createCart.cart.lines;
        const cartProductIds = cartLines.map(line => line.product.structure === 'child' ? line.product.parent.pk : line.product.pk);
        const upSellItem = await selectUpsellProduct(cartLines, cartProductIds);
        if (upSellItem) {
            localStorage.setItem('upSellItem', JSON.stringify(upSellItem));
            checkoutFormContent.insertAdjacentHTML('afterbegin', createUpsellHTML(upSellItem));
            document.getElementById(`addUpsellButton-${upSellItem.productPk}`).addEventListener('click', processUpsell);
        } else {
            console.log('No upsell matches found.');
        }
    });
}