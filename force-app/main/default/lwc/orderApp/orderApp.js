import { LightningElement, wire, api, track } from 'lwc';
import getActiveCart from '@salesforce/apex/CartController.getActiveCart';
import updateCartItems from '@salesforce/apex/CartController.updateCartItems';
import checkoutCart from '@salesforce/apex/CartController.checkoutCart';
import getMenuItems from '@salesforce/apex/MenuController.getMenuItems';
import getTableName from '@salesforce/apex/TableManagerController.getTableName';
import getBillForOrder from '@salesforce/apex/BillController.getBillForOrder';
import sendBillEmail from '@salesforce/apex/BillEmailService.sendBillEmail';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

export default class OrderAppWithBill extends LightningElement {
    @track cartItems = [];
    @track total = 0;
    @track formattedTotal = '0.00';
    @track orderId;
    @track showBillSection = false;
    @track hasExistingCart = false;
    @track showPaymentModal = false;
    @track selectedPayment = 'Cash';
    @track tableName = 'Loading table...';
    @track tableNameLoading = true;
    @track tableNameError = false;

    @track bill;
    @track isBillLoading = false;
    @track parsedItems = [];
    @track billNumber = '';
    @track customerName = 'Guest';
    @track billTableName = '';
    @track paymentMethod = '';
    @track itemCount = 0;
    @track showModal = false;
    @track showEmailInput = false;
    @track emailToSend = '';

    columns = [
        { label: 'Item', fieldName: 'name' },
        { label: 'Quantity', fieldName: 'quantity', type: 'number' },
        { label: 'Price', fieldName: 'price', type: 'currency', typeAttributes: { currencyCode: 'INR' } },
        { label: 'Total', fieldName: 'total', type: 'currency', typeAttributes: { currencyCode: 'INR' } }
    ];

    allMenuItems = [];
    cartId;
    _tableId = null;

    connectedCallback() {
        const urlParams = new URLSearchParams(window.location.search);
        const tableId = urlParams.get('c__tableId');
        if (tableId) {
            this.tableId = tableId;
        }
    }

    @api 
    get tableId() { return this._tableId; }
    set tableId(value) {
        if (!value) return;
        this._tableId = value;
        this.loadCart();
        this.fetchTableName(value);
    }

    async loadCart() {
        try {
            const cart = await getActiveCart({ tableId: this._tableId });
            if (cart) {
                this.cartId = cart.Id;
                this.cartItems = cart.Items_JSON__c ? JSON.parse(cart.Items_JSON__c) : [];
                this.total = cart.Total_Amount__c || 0;
                this.formattedTotal = this.formatCurrency(this.total);
                this.hasExistingCart = true;
                this.updateCartTotals();
            }
        } catch (error) {
            this.showToast('Error', 'Failed to load cart: ' + error.body?.message, 'error');
        }
    }

    fetchTableName(tableId) {
        this.tableNameLoading = true;
        this.tableNameError = false;
        getTableName({ tableId })
            .then(result => {
                this.tableName = result || `TBL-${tableId.substring(0, 8)}`;
                this.tableNameLoading = false;
            })
            .catch(error => {
                this.tableName = `TBL-${tableId.substring(0, 8)}`;
                this.tableNameError = true;
                this.tableNameLoading = false;
            });
    }

    @wire(getMenuItems, { category: 'All' })
    wiredMenuItems({ error, data }) {
        if (data) this.allMenuItems = data;
        else if (error) this.showToast('Error', error.body?.message || 'Failed to load menu', 'error');
    }

    handleAddToCart(event) {
        const item = event.detail;

        const existingIndex = this.cartItems.findIndex(i => i.id === item.id);
        if (existingIndex >= 0) {
            this.cartItems[existingIndex].quantity += 1;
        } else {
            this.cartItems.push({
                id: item.id,
                name: item.name,
                price: item.price,
                quantity: 1,
                formattedPrice: this.formatCurrency(item.price)
            });
        }

        this.updateCartTotals();
        this.saveCartToServer();
        this.hasExistingCart = true;
    }


    handleRemoveItem(event) {
        const itemId = event.target.dataset.id;
        const itemIndex = this.cartItems.findIndex(item => item.id === itemId);
        if (itemIndex >= 0) {
            if (this.cartItems[itemIndex].quantity > 1) {
                this.cartItems[itemIndex].quantity -= 1;
            } else {
                this.cartItems = this.cartItems.filter(item => item.id !== itemId);
            }
            this.updateCartTotals();
            this.saveCartToServer();
            this.hasExistingCart = this.cartItems.length > 0;
        }
    }

    handleNewOrder() {
        this.cartItems = [];
        this.total = 0;
        this.formattedTotal = this.formatCurrency(0);
        this.orderId = null;
        this.showBillSection = false;
        this.hasExistingCart = false;

        if (this.cartId) {
            updateCartItems({
                cartId: this.cartId,
                itemsJSON: JSON.stringify([]),
                totalAmount: 0
            }).catch(error => {
                this.showToast('Error', 'Failed to clear cart: ' + error.body?.message, 'error');
            });
        }
    }

    updateCartTotals() {
        this.total = this.cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        this.formattedTotal = this.formatCurrency(this.total);
        this.cartItems = this.cartItems.map(item => ({ ...item, formattedTotal: this.formatCurrency(item.price * item.quantity) }));
    }

    formatCurrency(value) {
        try {
            if (value === null || value === undefined) return '₹0.00';
            let numValue = value;
            if (typeof value === 'string' && value.replace) {
                numValue = parseFloat(value.replace(/[^\d.-]/g, ''));
            }
            if (isNaN(numValue)) return '₹0.00';
            return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(numValue);
        } catch (e) {
            return '₹0.00';
        }
    }

    async saveCartToServer() {
        if (!this.cartId) return;
        try {
            await updateCartItems({
                cartId: this.cartId,
                itemsJSON: JSON.stringify(this.cartItems),
                totalAmount: this.total
            });
        } catch (error) {
            this.showToast('Error', 'Failed to save cart: ' + error.body?.message, 'error');
        }
    }

    handleCheckout() {
        if (this.cartItems.length === 0) {
            this.showToast('Error', 'Cart is empty', 'error');
            return;
        }
        this.showPaymentModal = true;
    }

    handlePaymentChange(event) {
        this.selectedPayment = event.detail.value;
    }

    closePaymentModal() {
        this.showPaymentModal = false;
    }

    async handleConfirmPayment() {
        try {
            this.showPaymentModal = false;
            await this.saveCartToServer();
            const newOrder = await checkoutCart({ cartId: this.cartId, paymentMethod: this.selectedPayment });
            this.orderId = newOrder.Id;
            this.showBillSection = true;
            this.hasExistingCart = false;
            this.cartItems = [];
            this.total = 0;
            this.formattedTotal = this.formatCurrency(0);
            this.loadBill();
        } catch (error) {
            this.showToast('Checkout Failed', error.body?.message || error.message, 'error');
        }
    }

    async loadBill() {
        this.isBillLoading = true;
        try {
            const result = await getBillForOrder({ orderId: this.orderId });
            this.bill = result;
            this.billNumber = result.Name;
            this.billTableName = result.Table__r?.Name || 'Table';
            this.customerName = result.Order__r?.Customer_Name__c || 'Guest';
            this.paymentMethod = result.Payment_Method__c || '';
            this.itemCount = result.Item_Count__c || 0;
            this.formattedTotal = this.formatCurrency(result.Total_Amount__c);
            const items = JSON.parse(result.Items_JSON__c || '[]');
            this.parsedItems = items.map(item => ({
                name: item.name || 'Unnamed Item',
                quantity: Number(item.quantity) || 0,
                price: Number(item.price) || 0,
                total: (Number(item.price) || 0) * (Number(item.quantity) || 0)
            }));
        } catch (error) {
            this.showToast('Error', 'Failed to load bill: ' + (error.body?.message || error.message), 'error');
            this.parsedItems = [];
        } finally {
            this.isBillLoading = false;
        }
    }

    async sendEmail() {
        if (!this.validateEmail(this.emailToSend)) {
            this.showToast('Invalid Email', 'Please enter a valid email address', 'warning');
            return;
        }
        try {
            await sendBillEmail({ billId: this.bill.Id, recipientEmail: this.emailToSend });
            this.showToast('Success', 'Bill emailed successfully!', 'success');
            this.handleCloseModal();
        } catch (error) {
            this.showToast('Error', error.body?.message || error.message, 'error');
        }
    }

    handleDownloadPDF() {
        if (!this.bill || !this.bill.Id) {
            this.showToast('Error', 'Bill ID is missing', 'error');
            return;
        }

        try {
            const vfUrl = `/apex/BillPDFPage?id=${this.bill.Id}`;
            window.open(vfUrl, '_blank');
        } catch (error) {
            this.showToast('Error', 'Failed to open PDF: ' + error.message, 'error');
        }
    }

    handleGenerateOptions() { this.showModal = true; }
    handleCloseModal() { this.showModal = false; this.showEmailInput = false; this.emailToSend = ''; }
    handleShowEmailInput() { this.showEmailInput = true; }
    handleEmailChange(event) { this.emailToSend = event.target.value; }
    get isEmailInvalid() { return !this.emailToSend || !this.validateEmail(this.emailToSend); }
    validateEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
    showToast(title, message, variant) { this.dispatchEvent(new ShowToastEvent({ title, message, variant })); }
    get paymentOptions() { return [ { label: 'UPI', value: 'UPI' }, { label: 'Cash', value: 'Cash' }, { label: 'Card', value: 'Card' } ]; }
    get isUPI() { return this.selectedPayment === 'UPI'; }
    get isCash() { return this.selectedPayment === 'Cash'; }
    get isCard() { return this.selectedPayment === 'Card'; }
}
