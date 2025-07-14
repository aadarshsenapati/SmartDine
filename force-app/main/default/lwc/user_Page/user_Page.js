import { LightningElement, api, track } from 'lwc';
import getCustomerNameByTable from '@salesforce/apex/TableManagerController.getCustomerNameByTable';
import getActiveCart from '@salesforce/apex/CartController.getActiveCart';
import updateCartItems from '@salesforce/apex/CartController.updateCartItems';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import SmartDineLogo from '@salesforce/resourceUrl/SmartDine';

export default class UserPage extends LightningElement {
    @api tableId;
    customerName = '';
    @track cartItems = [];
    cartId;
    total = 0;
    formattedTotal = '0.00';
    placed = false;
    logoUrl = SmartDineLogo;

    connectedCallback() {
        const urlParams = new URLSearchParams(window.location.search);
        this.tableId = urlParams.get('c__tableId');
        if (this.tableId) {
            this.fetchCustomer();
            this.loadCart();
        }
    }

    fetchCustomer() {
        getCustomerNameByTable({ tableId: this.tableId })
        .then(name => {
            if (name && name.trim() !== '') {
                this.customerName = name;
            } else {
                this.customerName = null;
            }
        })
        .catch(error => {
            console.error('Customer fetch error:', error);
            this.customerName = null;
        });

    }
    get hasCustomer() {
        return !!this.customerName;
    }


    async loadCart() {
        try {
            const cart = await getActiveCart({ tableId: this.tableId });
            this.cartId = cart.Id;
            this.cartItems = cart.Items_JSON__c ? JSON.parse(cart.Items_JSON__c).map(item => ({
                ...item,
                status: item.status || 'Pending' // Default or read from server if available
            })) : [];
            this.total = cart.Total_Amount__c || 0;
            // this.formatCartItems(); // Add formatted price/total
            // this.updateFormattedTotal();
            this.recalculateCart();


            if (cart.Status__c === 'Completed') {
                this.placed = true;
            }
        } catch (e) {
            this.showToast('Error', 'Unable to load cart', 'error');
        }
    }

    handleAddToCart(event) {
        const item = event.detail;
        const existing = this.cartItems.find(i => i.id === item.id);

        if (existing) {
            existing.quantity += 1;
            existing.total = existing.quantity * existing.price;
        } else {
            this.cartItems.push({
                id: item.id,
                name: item.name,
                price: item.price,
                quantity: 1,
                total: item.price
            });
        }

        this.cartItems = this.cartItems.map(i => ({
            ...i,
            total: i.quantity * i.price
        }));

        this.updateTotal();
        this.formatCartItems();
        this.saveCart();
    }
    recalculateCart() {
        this.cartItems = this.cartItems.map(item => ({
            ...item,
            total: item.quantity * item.price
        }));
        this.updateTotal();
        this.formatCartItems();
    }


    increment(event) {
        const id = event.target.dataset.id;
        const item = this.cartItems.find(i => i.id === id);
        item.quantity++;
        item.total = item.quantity * item.price;
        this.cartItems = [...this.cartItems];
        this.updateTotal();
        this.formatCartItems();
        this.saveCart();
    }

    decrement(event) {
        const id = event.target.dataset.id;
        const index = this.cartItems.findIndex(i => i.id === id);
        if (this.cartItems[index].quantity > 1) {
            this.cartItems[index].quantity--;
            this.cartItems[index].total = this.cartItems[index].quantity * this.cartItems[index].price;
        } else {
            this.cartItems.splice(index, 1);
        }
        this.cartItems = [...this.cartItems];
        this.updateTotal();
        this.formatCartItems();
        this.saveCart();
    }

    updateTotal() {
        this.total = this.cartItems.reduce((sum, i) => sum + i.total, 0);
        this.updateFormattedTotal();
    }

    updateFormattedTotal() {
        this.formattedTotal = this.formatCurrency(this.total);
    }

    formatCartItems() {
        this.cartItems = this.cartItems.map(item => ({
            ...item,
            formattedPrice: this.formatCurrency(item.price),
            formattedTotal: this.formatCurrency(item.total),
            isLocked: item.status === 'Pending' || item.status === 'Preparing' || item.status === 'Prepared'
        }));
    }


    formatCurrency(val) {
        if (val === undefined || val === null) return '0.00';
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 2
        }).format(val);
    }

    async saveCart() {
        if (!this.cartId) return;
        try {
            await updateCartItems({
                cartId: this.cartId,
                itemsJSON: JSON.stringify(this.cartItems),
                totalAmount: this.total
            });
        } catch (e) {
            this.showToast('Error', 'Could not save cart', 'error');
        }
    }

    async placeOrder() {
        await this.saveCart();
        this.placed = true;
        this.showToast('Order Placed', 'Please call an agent for bill', 'success');
    }

    showToast(title, msg, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message: msg, variant }));
    }

    get hasItems() {
        return this.cartItems.length > 0;
    }
    isStatusLocked(status) {
        return status === 'Pending' || status === 'Preparing' || status === 'Prepared';
    }


}
