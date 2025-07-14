import { LightningElement,api, track } from 'lwc';

export default class MobileAppWrapper extends LightningElement {
    @track currentView = 'customer'; // or 'order'
    @track selectedTableId;
    @api
    startOrderForTable(tableId) {
        this.selectedTableId = tableId;
        this.currentView = 'order';
    }


    handleStartOrder(event) {
        this.selectedTableId = event.detail.tableId;
        this.currentView = 'order';
    }

    handleBackToCustomer() {
        this.currentView = 'customer';
    }

    get isCustomerView() {
        return this.currentView === 'customer';
    }

    get isOrderView() {
        return this.currentView === 'order';
    }
}
