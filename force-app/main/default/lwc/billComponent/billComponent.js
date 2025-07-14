import { LightningElement, api, wire, track } from 'lwc';
import getBillForOrder from '@salesforce/apex/BillController.getBillForOrder';
import sendBillEmail from '@salesforce/apex/BillEmailService.sendBillEmail';
import { CurrentPageReference, NavigationMixin } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

export default class BillComponent extends NavigationMixin(LightningElement) {
    @track bill;
    @track isBillLoading = true;
    @track parsedItems = [];
    @track formattedTotal = '₹0.00';
    @track customerName = 'Guest';
    @track tableName = 'Table';
    @track billNumber = '';
    @track paymentMethod = '';
    @track itemCount = 0;

    @track showModal = false;
    @track showEmailInput = false;
    @track emailToSend = '';

    columns = [
        { label: 'Item', fieldName: 'name' },
        { label: 'Quantity', fieldName: 'quantity', type: 'number' },
        { 
            label: 'Price', 
            fieldName: 'price', 
            type: 'currency',
            typeAttributes: { currencyCode: 'INR' }
        },
        { 
            label: 'Total', 
            fieldName: 'total', 
            type: 'currency',
            typeAttributes: { currencyCode: 'INR' }
        }
    ];

    orderId;

    @wire(CurrentPageReference)
    getPageReference(pageRef) {
        if (pageRef && pageRef.state && pageRef.state.orderId) {
            this.orderId = pageRef.state.orderId;
            this.loadBill();
        }
    }

    async loadBill() {
        this.isBillLoading = true;
        try {
            const result = await getBillForOrder({ orderId: this.orderId });
            if (!result) {
                throw new Error('No bill data returned from server');
            }
            
            this.bill = result;
            this.billNumber = result.Name || '';
            this.tableName = result.Table__r?.Name || 'Table';
            this.customerName = result.Order__r?.Customer_Name__c || 'Guest';
            this.paymentMethod = result.Payment_Method__c || '';
            this.itemCount = result.Item_Count__c || 0;

            // Safely format total amount
            this.formattedTotal = this.formatCurrency(result.Total_Amount__c);

            // Safely parse items JSON
            if (result.Items_JSON__c) {
                try {
                    const items = JSON.parse(result.Items_JSON__c);
                    this.parsedItems = items.map(item => {
                        const quantity = Number(item.quantity) || 0;
                        const price = Number(item.price) || 0;
                        return {
                            name: item.name || 'Unnamed Item',
                            quantity,
                            price,
                            total: price * quantity
                        };
                    });
                } catch (jsonError) {
                    console.error('JSON parsing error:', jsonError);
                    this.parsedItems = [];
                    this.showToast('Data Error', 'Failed to parse order items', 'warning');
                }
            } else {
                this.parsedItems = [];
            }
        } catch (error) {
            console.error('Error loading bill:', error);
            const errorMsg = error.body?.message || error.message || 'Failed to load bill';
            this.showToast('Error', errorMsg, 'error');
            this.formattedTotal = '₹0.00';
            this.parsedItems = [];
        } finally {
            this.isBillLoading = false;
        }
    }

    // ✅ Safe & robust currency formatter
    formatCurrency(value) {
        try {
            if (value === null || value === undefined) return '₹0.00';

            let numValue = value;

            // If string, try to extract number
            if (typeof value === 'string' && value.replace) {
                numValue = parseFloat(value.replace(/[^\d.-]/g, ''));
            }

            // Fallback in case parse fails
            if (isNaN(numValue)) return '₹0.00';

            return new Intl.NumberFormat('en-IN', {
                style: 'currency',
                currency: 'INR',
                minimumFractionDigits: 2
            }).format(numValue);
        } catch (error) {
            console.error('Currency formatting error:', error);
            return '₹0.00';
        }
    }

    handleGenerateOptions() {
        this.showModal = true;
    }

    handleCloseModal() {
        this.showModal = false;
        this.showEmailInput = false;
        this.emailToSend = '';
    }

    handleShowEmailInput() {
        this.showEmailInput = true;
    }

    handleEmailChange(event) {
        this.emailToSend = event.target.value;
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
            const errorMsg = error.body?.message || error.message || 'Failed to send email';
            this.showToast('Error', errorMsg, 'error');
        }
    }

    handleDownloadPDF() {
        if (!this.bill?.Id) {
            this.showToast('Error', 'Bill ID is missing', 'error');
            return;
        }

        try {
            const url = `/apex/BillPDFPage?id=${this.bill.Id}`;
            window.open(url, '_blank');
        } catch (error) {
            this.showToast('Error', 'Failed to open PDF: ' + error.message, 'error');
        }
    }

    handleBackToOrder() {
        this[NavigationMixin.Navigate]({
            type: 'standard__navItemPage',
            attributes: { apiName: 'Customer_Agent' }
        });
    }

    validateEmail(email) {
        try {
            const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return regex.test(email);
        } catch (e) {
            return false;
        }
    }

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }

    get isEmailInvalid() {
        return !this.emailToSend || !this.validateEmail(this.emailToSend);
    }
}
