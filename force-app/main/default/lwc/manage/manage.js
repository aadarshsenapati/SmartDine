import { LightningElement, wire, track, api } from 'lwc';
import getVisibleTables from '@salesforce/apex/TableManagerController.getVisibleTables';
import getCustomersByTable from '@salesforce/apex/CustomerManagerController.getCustomersByTable';
import createCustomer from '@salesforce/apex/CustomerManagerController.createCustomer';
import unassignCustomerFromTable from '@salesforce/apex/CustomerManagerController.unassignCustomerFromTable';
import getActiveCart from '@salesforce/apex/CartController.getActiveCart';
import updateCartItems from '@salesforce/apex/CartController.updateCartItems';
import checkoutCart from '@salesforce/apex/CartController.checkoutCart';
import getBillForOrder from '@salesforce/apex/BillController.getBillForOrder';
import sendBillEmail from '@salesforce/apex/BillEmailService.sendBillEmail';
import { refreshApex } from '@salesforce/apex';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

export default class Manage extends LightningElement {
    @track isOrderMode = false;
    @track selectedTableId;
    @track selectedTableName;
    @track tables = [];
    @track customers = [];
    @track cartItems = [];
    @track cartId;
    @track cartTotal = 0;
    @track showCustomerForm = false;
    @track isLoading = false;
    @track isSubmitDisabled = false;
    @track showScanButton = true;
    @track showBillModal = false;
    @track billingEmail = '';
    @track billDetails;
    @track selectedPayment = 'Cash';
    @track showPaymentModal = false;
    @track wiredTablesResult;
    @track wiredCustomersResult;

    tableColumns = [
        { label: 'Table', fieldName: 'Name' },
        { label: 'Occupied', fieldName: 'IsOccupied__c', type: 'boolean' },
        { type: 'action', typeAttributes: { rowActions: [{ label: 'Select', name: 'select' }] } }
    ];

    customerColumns = [
        { label: 'Name', fieldName: 'Name', type: 'text', editable: true },
        { label: 'Phone', fieldName: 'Phone__c', type: 'phone', editable: true },
        { label: 'Email', fieldName: 'Email__c', type: 'email', editable: true },
        { type: 'action', typeAttributes: { rowActions: [{ label: 'Unassign', name: 'unassign' }] } }
    ];

    paymentOptions = [
        { label: 'Cash', value: 'Cash' },
        { label: 'Card', value: 'Card' },
        { label: 'UPI', value: 'UPI' }
    ];

    @wire(getVisibleTables)
    wiredTables(result) {
        this.wiredTablesResult = result;
        if (result.data) {
            this.tables = result.data.map(t => ({
                ...t,
                IsOccupied__c: t.Assigned_Customer__c ? true : false
            }));
        } else if (result.error) {
            this.showToast('Error', 'Failed to load tables', 'error');
        }
    }

    @wire(getCustomersByTable, { tableId: '$selectedTableId' })
    wiredCustomers(result) {
        this.wiredCustomersResult = result;
        if (result.data) {
            this.customers = result.data;
        } else if (result.error) {
            this.customers = [];
            this.showToast('Error', 'Failed to load customers', 'error');
        }
    }

    handleTableAction(event) {
        const action = event.detail.action;
        const row = event.detail.row;
        if (action.name === 'select') {
            this.selectedTableId = row.Id;
            this.selectedTableName = row.Name;
        }
    }

    clearTableSelection() {
        this.selectedTableId = null;
        this.selectedTableName = null;
        this.customers = [];
    }

    simulateQRScan() {
        const availableTables = this.tables.filter(table => !table.IsOccupied__c);
        if (availableTables.length === 0) {
            this.showToast('No Tables', 'All tables are occupied', 'warning');
            return;
        }
        const randomTable = availableTables[Math.floor(Math.random() * availableTables.length)];
        this.selectedTableId = randomTable.Id;
        this.selectedTableName = randomTable.Name;
        this.showToast('Table Selected', `Assigned to Table ${randomTable.Name}`, 'success');
    }

    openCustomerForm() {
        if (!this.selectedTableId) {
            this.showToast('Error', 'Please select a table first', 'error');
            return;
        }
        this.showCustomerForm = true;
    }

    closeCustomerForm() {
        this.showCustomerForm = false;
    }

    handleSubmit(event) {
        event.preventDefault();
        this.isLoading = true;
        this.isSubmitDisabled = true;

        const fields = event.detail.fields;
        if (!fields.Name) {
            this.showToast('Validation Error', 'Customer name is required', 'error');
            this.isLoading = false;
            this.isSubmitDisabled = false;
            return;
        }

        createCustomer({
            name: fields.Name,
            phone: fields.Phone__c,
            email: fields.Email__c,
            orderInfo: fields.Order_Info__c,
            tableId: this.selectedTableId
        })
        .then(() => {
            this.showToast('Success', 'Customer created', 'success');
            this.showCustomerForm = false;
            return refreshApex(this.wiredCustomersResult);
        })
        .then(() => refreshApex(this.wiredTablesResult))
        .catch(error => {
            this.showToast('Error', error.body?.message || 'Customer creation failed', 'error');
        })
        .finally(() => {
            this.isLoading = false;
            this.isSubmitDisabled = false;
        });
    }

    handleCreateOrder() {
        if (!this.selectedTableId) {
            this.showToast('Error', 'Select a table first', 'error');
            return;
        }
        if (!this.customers.length) {
            this.showToast('Error', 'Assign customers to this table first', 'error');
            return;
        }
        this.isOrderMode = true;
        this.loadCart();
    }

    async loadCart() {
        this.isLoading = true;
        try {
            const cart = await getActiveCart({ tableId: this.selectedTableId });
            this.cartId = cart.Id;
            this.cartItems = cart.Items_JSON__c ? JSON.parse(cart.Items_JSON__c) : [];
            this.calculateCartTotal();
        } catch (error) {
            this.showToast('Error', 'Could not load cart', 'error');
        } finally {
            this.isLoading = false;
        }
    }

    handleAddToCart(event) {
        if (!this.cartId) {
            this.showToast('Error', 'Cart not initialized', 'error');
            return;
        }
        const item = event.detail;
        const existingIndex = this.cartItems.findIndex(i => i.id === item.id);
        if (existingIndex >= 0) {
            this.cartItems[existingIndex].quantity += 1;
            this.cartItems[existingIndex].total = this.cartItems[existingIndex].price * this.cartItems[existingIndex].quantity;
        } else {
            this.cartItems.push({
                id: item.id, // Menu_Item__c Id
                name: item.name,
                price: item.price,
                quantity: 1,
                total: item.price * 1
            });
        }
        this.calculateCartTotal();
        this.syncCart();
    }

    removeFromCart(event) {
        const id = event.target.dataset.id;
        const itemIndex = this.cartItems.findIndex(item => item.id === id);
        if (itemIndex >= 0) {
            if (this.cartItems[itemIndex].quantity > 1) {
                this.cartItems[itemIndex].quantity -= 1;
                this.cartItems[itemIndex].total = this.cartItems[itemIndex].price * this.cartItems[itemIndex].quantity;
            } else {
                this.cartItems.splice(itemIndex, 1);
            }
            this.calculateCartTotal();
            this.syncCart();
        }
    }

    updateQuantity(event) {
        const id = event.target.dataset.id;
        const newQuantity = parseInt(event.target.value, 10);
        const itemIndex = this.cartItems.findIndex(item => item.id === id);
        if (itemIndex >= 0 && newQuantity > 0) {
            this.cartItems[itemIndex].quantity = newQuantity;
            this.cartItems[itemIndex].total = this.cartItems[itemIndex].price * newQuantity;
            this.calculateCartTotal();
            this.syncCart();
        }
    }

    clearCart() {
        this.cartItems = [];
        this.cartTotal = 0;
        this.syncCart();
    }

    calculateCartTotal() {
        this.cartTotal = this.cartItems.reduce((total, item) => total + item.total, 0);
    }

    syncCart() {
        if (!this.cartId) return;
        const validItems = this.cartItems.filter(i => i.id && i.name && i.price != null);
        updateCartItems({
            cartId: this.cartId,
            itemsJSON: JSON.stringify(validItems),
            totalAmount: this.cartTotal
        }).then(() => {
            console.log('✅ Cart synced to server');
        }).catch(error => {
            this.showToast('Error', 'Failed to update cart', 'error');
        });
    }

    handleCheckout() {
        if (this.cartItems.length === 0) {
            this.showToast('Error', 'Cart is empty', 'error');
            return;
        }
        this.syncCart();
        setTimeout(() => this.showPaymentModal = true, 300);
    }

    handlePaymentChange(event) {
        this.selectedPayment = event.detail.value;
    }

    closePaymentModal() {
        this.showPaymentModal = false;
    }

    handleConfirmPayment() {
        this.closePaymentModal();
        this.isLoading = true;
        checkoutCart({ cartId: this.cartId, paymentMethod: this.selectedPayment })
        .then(order => {
            this.orderId = order.Id;
            return getBillForOrder({ orderId: this.orderId });
        })
        .then(bill => {
            this.billDetails = bill;
            this.billingEmail = bill?.Order__r?.Customer_Email__c || '';
            this.showBillModal = true;
            this.cartItems = [];
            this.cartTotal = 0;
        })
        .catch(error => {
            this.showToast('Error', error.body?.message || 'Checkout failed', 'error');
        })
        .finally(() => {
            this.isLoading = false;
        });
    }

    handleSendEmail() {
        if (!this.validateEmail(this.billingEmail)) {
            this.showToast('Validation Error', 'Enter valid email address', 'error');
            return;
        }
        this.isLoading = true;
        sendBillEmail({ billId: this.billDetails.Id, recipientEmail: this.billingEmail })
        .then(() => {
            this.showToast('Success', 'Email sent successfully', 'success');
            this.showBillModal = false;
        })
        .catch(error => {
            this.showToast('Error', error.body?.message || 'Email failed', 'error');
        })
        .finally(() => {
            this.isLoading = false;
        });
    }

    handleDownloadPdf() {
        if (this.isMobileDevice()) {
            this.showToast('Notice', 'PDF download not supported on mobile. Sending bill to email instead.', 'info');
            this.handleSendEmail();
        } else {
            window.open(`/apex/BillPDFPage?id=${this.billDetails.Id}`, '_blank');
        }
    }

    isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|Windows Phone/i.test(navigator.userAgent);
    }

    handleBillingEmailChange(event) {
        this.billingEmail = event.target.value;
    }

    closeBillModal() {
        this.showBillModal = false;
    }

    validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}
