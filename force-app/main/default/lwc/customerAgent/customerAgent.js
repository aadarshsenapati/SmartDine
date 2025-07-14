import { LightningElement, wire, api, track } from 'lwc';
import { registerListener, unregisterAllListeners, fireEvent } from 'c/pubsub';
import getVisibleTables from '@salesforce/apex/TableManagerController.getVisibleTables';
import getCustomersByTable from '@salesforce/apex/CustomerManagerController.getCustomersByTable';
import createCustomer from '@salesforce/apex/CustomerManagerController.createCustomer';
import updateCustomers from '@salesforce/apex/CustomerManagerController.updateCustomers';
import unassignCustomerFromTable from '@salesforce/apex/CustomerManagerController.unassignCustomerFromTable';
import createOrder from '@salesforce/apex/MenuController.createOrder';
import { refreshApex } from '@salesforce/apex';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { NavigationMixin } from 'lightning/navigation';
import Name from '@salesforce/schema/Account.Name';
import updateBillStatus from '@salesforce/apex/BillController.updateBillStatus';

const TABLE_COLUMNS = [
    { label: 'Table #', fieldName: 'Name', type: 'text' },
    { label: 'Status', fieldName: 'IsOccupied__c', type: 'boolean' },
    {
        type: 'action',
        typeAttributes: { rowActions: [{ label: 'Manage Customer', name: 'assign' }] }
    }
];

const CUSTOMER_COLUMNS = [
    { label: 'Name', fieldName: 'Name', type: 'text', editable: true },
    { label: 'Phone', fieldName: 'Phone__c', type: 'phone', editable: true },
    { label: 'Email', fieldName: 'Email__c', type: 'email', editable: true },
    { label: 'Order Info', fieldName: 'Order_Info__c', type: 'text', editable: true },
    {
        type: 'action',
        typeAttributes: {
            rowActions: [{ label: 'Unassign', name: 'unassign' }]
        }
    }
];

export default class CustomerAgent extends NavigationMixin(LightningElement) {
    tableColumns = TABLE_COLUMNS;
    customerColumns = CUSTOMER_COLUMNS;
    tables = [];
    customers = [];
    selectedTableId;
    selectedTableName;
    customerDraftValues = [];
    wiredTablesResult;
    wiredCustomersResult;
    showScanButton = false;
    showCustomerForm = false;
    isLoading = false;
    @track pendingPayments = [];
    @track showPaymentModal = false;
    @track currentPayment;

    connectedCallback() {
        const urlParams = new URLSearchParams(window.location.search);
        const tableId = urlParams.get('tableId');
        if (tableId) {
            this.selectedTableId = tableId;
        } else {
            this.showScanButton = true;
        }
        registerListener('paymentrequest', this.handlePaymentRequest, this);
    }
    disconnectedCallback() {
        unregisterAllListeners(this);
    }

    @wire(getVisibleTables)
    wiredTables(result) {
        this.wiredTablesResult = result;
        if (result.data) {
            this.tables = result.data.map(table => ({
                ...table,
                IsOccupied__c: table.Assigned_Customer__c ? true : false
            }));
            
            if (this.selectedTableId) {
                const selectedTable = this.tables.find(t => t.Id === this.selectedTableId);
                if (selectedTable) {
                    this.selectedTableName = selectedTable.Name;
                }
            }
        } else if (result.error) {
            console.error('Error loading tables:', result.error);
            this.showToast('Error', 'Failed to load tables', 'error');
        }
    }

    @wire(getCustomersByTable, { tableId: '$selectedTableId' })
    wiredCustomers(result) {
        this.wiredCustomersResult = result;
        if (result.data) {
            this.customers = result.data;
        } else if (result.error) {
            console.error('Error loading customers:', result.error);
            this.showToast('Error', 'Failed to load customers', 'error');
        }
    }

    handleTableAction(event) {
        const action = event.detail.action;
        const row = event.detail.row;
        if (action.name === 'assign') {
            this.selectedTableId = row.Id;
            this.selectedTableName = row.Name;
            this.showToast('Table Selected', `Table ${row.Name} selected`, 'success');
        }
    }

    openCustomerForm() {
        if (!this.selectedTableId) {
            this.showToast('Select a Table', 'Please select a table before creating a customer', 'error');
            return;
        }
        this.showCustomerForm = true;
    }

    closeCustomerForm() {
        this.showCustomerForm = false;
    }

    handleCreateOrder() {
        if (!this.selectedTableId) {
            this.showToast('Error', 'Please select a table first', 'error');
            return;
        }

        if (!this.customers.length) {
            this.showToast('Error', 'No customers at this table', 'error');
            return;
        }

        const customer = this.customers[0];

        // Store info for use in OrderApp (optional)
        sessionStorage.setItem('selectedTableId', this.selectedTableId);
        sessionStorage.setItem('selectedTableName', this.selectedTableName);
        sessionStorage.setItem('customerName', customer.Name);
        sessionStorage.setItem('customerPhone', customer.Phone__c || '');
        sessionStorage.setItem('customerEmail', customer.Email__c || '');

        this[NavigationMixin.Navigate]({
            type: 'standard__navItemPage',
            attributes: {
                apiName: 'Order_Management'
            },
            state: {
                c__tableId: this.selectedTableId
            }
        });
    }



    handleSubmit(event) {
        event.preventDefault();
        this.isLoading = true;
        
        const fields = event.detail.fields;
        
        // Extract form data
        const customerData = {
            name: fields.Name || '',
            phone: fields.Phone__c || '',
            email: fields.Email__c || '',
            orderInfo: fields.Order_Info__c || '',
            tableId: this.selectedTableId
        };

        // Validate required fields
        if (!customerData.name.trim()) {
            this.showToast('Validation Error', 'Customer name is required', 'error');
            this.isLoading = false;
            return;
        }

        // Call Apex method to create customer
        createCustomer({
            name: customerData.name,
            phone: customerData.phone,
            email: customerData.email,
            orderInfo: customerData.orderInfo,
            tableId: customerData.tableId
        })
        .then(result => {
            this.showToast('Success', 'Customer created successfully', 'success');
            this.showCustomerForm = false;
            this.isLoading = false;
            
            // Refresh both tables and customers data
            return Promise.all([
                refreshApex(this.wiredTablesResult),
                refreshApex(this.wiredCustomersResult)
            ]);
        })
        .then(() => {
            // Highlight the table as occupied
            this.highlightSelectedTable();
        })
        .catch(error => {
            console.error('Error creating customer:', error);
            this.isLoading = false;
            
            let message = 'Unknown error occurred';
            if (error.body?.message) {
                message = error.body.message;
            } else if (error.message) {
                message = error.message;
            }
            
            this.showToast('Error Creating Customer', message, 'error');
        });
    }

    handleCustomerSuccess(event) {
        // This method is kept for compatibility but main logic moved to handleSubmit
        console.log('Customer success event:', event.detail);
    }
    
    highlightSelectedTable() {
        setTimeout(() => {
            const tableElement = this.template.querySelector(`tr[data-row-key-value="${this.selectedTableId}"]`);
            if (tableElement) {
                tableElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                tableElement.classList.add('slds-theme_success');
                setTimeout(() => tableElement.classList.remove('slds-theme_success'), 3000);
            }
        }, 500);
    }
    
    handleFormError(event) {
        const errors = event.detail;
        let message = 'Unknown error';
        
        if (Array.isArray(errors)) {
            message = errors.map(e => e.message).join(', ');
        } else if (typeof errors === 'string') {
            message = errors;
        } else if (errors.body?.output?.errors) {
            message = errors.body.output.errors.map(e => e.message).join(', ');
        } else if (errors.body?.message) {
            message = errors.body.message;
        }
        
        this.showToast('Error Creating Customer', message, 'error');
        this.isLoading = false;
    }
    handleCustomerRowAction(event) {
        const action = event.detail.action;
        const row = event.detail.row;

        if (action.name === 'unassign') {
    if (!row.Id) {
        this.showToast('Error', 'Customer ID is missing', 'error');
        return;
    }

    unassignCustomerFromTable({ customerId: row.Id })
        .then(() => {
            this.showToast('Success', 'Customer unassigned', 'success');
            return Promise.all([
                refreshApex(this.wiredCustomersResult),
                refreshApex(this.wiredTablesResult)
            ]);
        })
        .catch(error => {
            console.error(error);
            this.showToast('Error', error.body?.message || 'Error unassigning customer', 'error');
        });
}

    }
    


    handleCustomerSave(event) {
        const updatedCustomers = event.detail.draftValues;
        
        if (updatedCustomers && updatedCustomers.length > 0) {
            // Create proper customer objects with IDs
            const customersToUpdate = updatedCustomers.map(customer => {
                return {
                    Id: customer.Id,
                    Name: customer.Name,
                    Phone__c: customer.Phone__c,
                    Email__c: customer.Email__c,
                    Order_Info__c: customer.Order_Info__c
                };
            });
            
            updateCustomers({ customers: customersToUpdate })
                .then(() => {
                    this.customerDraftValues = [];
                    this.showToast('Success', 'Customer(s) updated successfully', 'success');
                    return refreshApex(this.wiredCustomersResult);
                })
                .catch(error => {
                    console.error('Update error:', error);
                    this.showToast('Error', error.body?.message || 'Error updating customers', 'error');
                });
        }
    }
    
    simulateQRScan() {
        if (this.tables.length > 0) {
            const availableTables = this.tables.filter(table => !table.IsOccupied__c);
            
            if (availableTables.length === 0) {
                this.showToast('No Available Tables', 'All tables are currently occupied', 'warning');
                return;
            }
            
            const randomIndex = Math.floor(Math.random() * availableTables.length);
            const table = availableTables[randomIndex];
            this.selectedTableId = table.Id;
            this.selectedTableName = table.Name;
            this.showToast('Scan Simulated', `Table ${table.Name} selected`, 'success');
        } else {
            this.showToast('No Tables Available', 'No tables found in the system', 'error');
        }
    }

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }

    get isSubmitDisabled() {
        return this.isLoading;
    }
    handlePaymentRequest(payload) {
        const table = this.tables.find(t => t.Id === payload.tableId);
        if (table) {
            this.pendingPayments = [...this.pendingPayments, {
                billId: payload.billId,
                tableId: payload.tableId,
                tableName: table.Name,
                timestamp: new Date().toISOString()
            }];
            
            // Show notification
            this.showToast('Payment Request', `Payment pending for Table ${table.Name}`, 'info');
        }
    }

    handleShowPaymentConfirmation(event) {
        const billId = event.target.dataset.billid;
        this.showPaymentConfirmation(billId);
    }

    showPaymentConfirmation(billId) {
        this.currentPayment = this.pendingPayments.find(p => p.billId === billId);
        if (this.currentPayment) {
            this.showPaymentModal = true;
        }
    }

    confirmPayment() {
        if (!this.currentPayment) return;
        
        updateBillStatus({ billId: this.currentPayment.billId, status: 'Confirmed' })
            .then(() => {
                // Notify User_Page
                fireEvent('paymentConfirmed', this.currentPayment.billId);
                
                // Remove from pending payments
                this.pendingPayments = this.pendingPayments.filter(
                    p => p.billId !== this.currentPayment.billId
                );
                
                this.showPaymentModal = false;
                this.currentPayment = null;
                this.showToast('Success', 'Payment confirmed!', 'success');
            })
            .catch(error => {
                this.showToast('Error', error.body?.message || 'Payment confirmation failed', 'error');
            });
    }

    cancelPayment() {
        this.showPaymentModal = false;
        this.currentPayment = null;
    }
}
