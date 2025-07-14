import { LightningElement, wire, track } from 'lwc';
import getActiveOrderItems from '@salesforce/apex/ChefController.getActiveOrderItems';
import markItemPrepared from '@salesforce/apex/ChefController.markItemPrepared';
import notifyWaiter from '@salesforce/apex/ChefController.notifyWaiter'; // Optional
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { refreshApex } from '@salesforce/apex';

export default class ChefPage extends LightningElement {
    @track items = [];
    @track filteredItems = [];
    @track tableOptions = [];
    @track selectedTable = '';
    @track selectedStatus = '';
    wiredResult;
    @track statusCounts = {
        Pending: 0,
        Preparing: 0,
        Prepared: 0
    };
    @track selectedStatus = 'Pending';


    get statusOptions() {
        return [
            { label: 'Pending', value: 'Pending' },
            { label: 'Preparing', value: 'Preparing' },
            { label: 'Prepared', value: 'Prepared' },
            { label: 'All', value: '' }
        ];
    }

    get noItems() {
        return this.filteredItems.length === 0;
    }

    @wire(getActiveOrderItems)
    wiredItems(result) {
        this.wiredResult = result;
        if (result.data) {
            const data = result.data;

            // Reset counts
            this.statusCounts = {
                Pending: 0,
                Preparing: 0,
                Prepared: 0
            };

            // Map & count
            this.items = data.map(item => {
            const status = item.Status__c;
            const isPrepared = status === 'Prepared';
            const isDelivered = status === 'Delivered';
            let badgeClass = 'slds-theme_warning';
            if (status === 'Prepared') badgeClass = 'slds-theme_success';
            else if (status === 'Preparing') badgeClass = 'slds-theme_info';

            // Count
            if (this.statusCounts[status] !== undefined) {
                this.statusCounts[status]++;
            }

            return {
                ...item,
                isPrepared,
                isDelivered,
                disablePreparedButton: isPrepared || isDelivered, // ✅ Add this
                badgeClass
            };
        });


            this.extractTableOptions(this.items);
            this.filterItems();
        } else if (result.error) {
            this.showToast('Error', 'Failed to fetch items', 'error');
        }
    }



    extractTableOptions(data) {
        const tables = new Set();
        data.forEach(item => {
            if (item?.Order__r?.Table__r?.Name) {
                tables.add(item.Order__r.Table__r.Name);
            }
        });

        const options = Array.from(tables).map(name => ({
            label: name,
            value: name
        }));

        this.tableOptions = [{ label: 'All', value: '' }, ...options];
    }

    handleTableChange(event) {
        this.selectedTable = event.detail.value;
        this.filterItems();
    }

    handleStatusChange(event) {
        this.selectedStatus = event.detail.value;
        this.filterItems();
    }

    filterItems() {
        const filtered = this.items.filter(item => {
            const matchTable = !this.selectedTable || item.Order__r?.Table__r?.Name === this.selectedTable;

            // Treat Delivered as Prepared for filtering
            const matchStatus =
                !this.selectedStatus ||
                item.Status__c === this.selectedStatus ||
                (this.selectedStatus === 'Prepared' && item.Status__c === 'Delivered');

            return matchTable && matchStatus;
        });

        this.filteredItems = filtered.reverse();
    }



    async handleMarkPrepared(event) {
        const itemId = event.target.dataset.id;
        try {
            await markItemPrepared({ orderItemId: itemId });

            // OPTIONAL: Automatically notify waiter
            await notifyWaiter({ orderItemId: itemId }); // Implement this method in Apex if needed

            this.showToast('Success', 'Marked as Prepared and waiter notified.', 'success');
            await refreshApex(this.wiredResult);
        } catch (error) {
            this.showToast('Error', error.body?.message || 'Update failed', 'error');
        }
    }

    getStatusBadgeClass(status) {
        switch (status) {
            case 'Prepared':
                return 'slds-theme_success';
            case 'Preparing':
                return 'slds-theme_info';
            case 'Pending':
            default:
                return 'slds-theme_warning';
        }
    }

    isPrepared(status) {
        return status === 'Prepared';
    }
    get pendingLabel() {
        return `Pending: ${this.statusCounts.Pending}`;
    }

    get preparingLabel() {
        return `Preparing: ${this.statusCounts.Preparing}`;
    }

    get preparedLabel() {
        return `Prepared: ${this.statusCounts.Prepared}`;
    }
    

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}
