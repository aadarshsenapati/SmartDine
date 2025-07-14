import { LightningElement, api, wire, track } from 'lwc';
import getCartItems from '@salesforce/apex/OrderController.getCartItems';
import addToCart from '@salesforce/apex/OrderController.addToCart';
import updateOrderTotals from '@salesforce/apex/OrderController.updateOrderTotals';
import updateCartItemQuantity from '@salesforce/apex/OrderController.updateCartItemQuantity';
import { refreshApex } from '@salesforce/apex';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

const COLUMNS = [
    { label: 'Item', fieldName: 'Name' },
    { label: 'Price', fieldName: 'Item_Price__c', type: 'currency' },
    { 
        label: 'Quantity', 
        fieldName: 'Quantity__c', 
        type: 'number', 
        editable: true,
        cellAttributes: { alignment: 'left' } 
    },
    { label: 'Type', fieldName: 'Veg_Non_Veg__c' },
    { label: 'Total', fieldName: 'itemTotal', type: 'currency' }
];

export default class OrderComponent extends LightningElement {
    @api orderId;
    @track cartItems = [];
    @track subTotal = 0;
    @track gst = 0;
    @track grandTotal = 0;
    @track isCartEmpty = true;
    @track isUpdating = false;
    @track draftValues = [];
    columns = COLUMNS;
    wiredCartItemsResult;

    @wire(getCartItems, { orderId: '$orderId' })
    wiredCartItems(result) {
        this.wiredCartItemsResult = result;
        if (result.data) {
            this.cartItems = result.data.map(item => ({
                ...item,
                itemTotal: (item.Item_Price__c || 0) * (item.Quantity__c || 0)
            }));
            this.calculateTotals();
            this.isCartEmpty = this.cartItems.length === 0;
        } else if (result.error) {
            this.showToast('Error', result.error.body.message, 'error');
        }
    }

    calculateTotals() {
        this.subTotal = this.cartItems.reduce((sum, item) => {
            return sum + (item.Item_Price__c || 0) * (item.Quantity__c || 0);
        }, 0);
        
        this.gst = this.subTotal * 0.18;
        this.grandTotal = this.subTotal + this.gst;
        
        this.updateServerTotals();
    }

    async updateServerTotals() {
        try {
            await updateOrderTotals({
                orderId: this.orderId,
                gst: this.gst,
                totalAmount: this.grandTotal
            });
        } catch (error) {
            this.showToast('Error', error.body?.message || error.message, 'error');
        }
    }

    // Add to cart method called by parent
    async addToCart(menuItemId) {
        this.isUpdating = true;
        try {
            await addToCart({
                orderId: this.orderId, 
                menuItemId: menuItemId
            });
            
            // Refresh cart data
            await refreshApex(this.wiredCartItemsResult);
        } catch (error) {
            this.showToast('Error', error.body?.message || error.message, 'error');
        } finally {
            this.isUpdating = false;
        }
    }

    async handleQuantityChange(event) {
        this.isUpdating = true;
        const draftValues = event.detail.draftValues;
        
        try {
            await Promise.all(draftValues.map(draft => {
                return updateCartItemQuantity({
                    itemId: draft.Id,
                    newQuantity: draft.Quantity__c
                });
            }));
            
            await refreshApex(this.wiredCartItemsResult);
            this.draftValues = [];
        } catch (error) {
            this.showToast('Error', error.body?.message || error.message, 'error');
        } finally {
            this.isUpdating = false;
        }
    }

    async handlePlaceOrder() {
        this.isUpdating = true;
        try {
            await this.updateServerTotals();
            await this.placeOrder();
            this.showToast('Success', 'Order placed successfully', 'success');
            this.resetCart();
        } catch (error) {
            this.showToast('Error', error.body?.message || error.message, 'error');
        } finally {
            this.isUpdating = false;
        }
    }

    async placeOrder() {
        return new Promise((resolve, reject) => {
            placeOrder({ orderId: this.orderId })
                .then(() => resolve())
                .catch(error => reject(error));
        });
    }

    resetCart() {
        this.cartItems = [];
        this.subTotal = 0;
        this.gst = 0;
        this.grandTotal = 0;
        this.isCartEmpty = true;
    }

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}