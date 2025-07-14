import { LightningElement, track, wire } from 'lwc';
import getWaiterItems from '@salesforce/apex/WaiterController.getWaiterItems';
import markItemCompleted from '@salesforce/apex/WaiterController.markItemCompleted';
import undoItemDelivery from '@salesforce/apex/WaiterController.undoItemDelivery';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { refreshApex } from '@salesforce/apex';

export default class WaiterPage extends LightningElement {
    @track items = [];
    @track selectedStatus = 'Prepared';
    wiredResult;

    @wire(getWaiterItems)
    wiredItems(result) {
        this.wiredResult = result;
        if (result.data) {
            this.items = result.data;
        } else if (result.error) {
            this.showToast('Error', 'Could not fetch items', 'error');
        }
    }

    get statusOptions() {
        return [
            { label: 'Prepared', value: 'Prepared' },
            { label: 'Delivered', value: 'Delivered' }
        ];
    }

    get filteredItems() {
        return this.items.filter(i => i.Status__c === this.selectedStatus);
    }

    get isEmpty() {
        return this.filteredItems.length === 0;
    }

    handleStatusChange(event) {
        this.selectedStatus = event.detail.value;
    }

    async handleComplete(event) {
        const itemId = event.target.dataset.id;
        try {
            await markItemCompleted({ orderItemId: itemId });
            this.showToast('Success', 'Marked as Delivered', 'success');
            await refreshApex(this.wiredResult);
        } catch (e) {
            this.showToast('Error', e.body?.message || 'Failed to update', 'error');
        }
    }

    async handleUndo(event) {
        const itemId = event.target.dataset.id;
        try {
            await undoItemDelivery({ orderItemId: itemId });
            this.showToast('Success', 'Undo successful', 'success');
            await refreshApex(this.wiredResult);
        } catch (e) {
            this.showToast('Error', e.body?.message || 'Failed to undo', 'error');
        }
    }

    isPrepared(status) {
        return status === 'Prepared';
    }

    isDelivered(status) {
        return status === 'Delivered';
    }

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
    @wire(getWaiterItems)
    wiredItems(result) {
        this.wiredResult = result;
        if (result.data) {
            // Precompute isPrepared and isDelivered
            this.items = result.data.map(item => ({
                ...item,
                isPrepared: item.Status__c === 'Prepared',
                isDelivered: item.Status__c === 'Delivered'
            }));
        } else if (result.error) {
            this.showToast('Error', 'Could not fetch items', 'error');
        }
    }

}
