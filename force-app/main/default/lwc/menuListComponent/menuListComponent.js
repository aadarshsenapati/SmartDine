import { LightningElement, wire, track } from 'lwc';
import getMenuItems from '@salesforce/apex/MenuController.getMenuItems';
import updateMenuItem from '@salesforce/apex/MenuController.updateMenuItem';
import deleteMenuItem from '@salesforce/apex/MenuController.deleteMenuItem';
import addMenuItem from '@salesforce/apex/MenuController.addMenuItem';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { refreshApex } from '@salesforce/apex';

const COLUMNS = [
    { label: 'Name', fieldName: 'Name', type: 'text', editable: true },
    { label: 'Price', fieldName: 'Price__c', type: 'currency', typeAttributes: { currencyCode: 'INR' }, editable: true },
    { label: 'Category', fieldName: 'Category__c', type: 'text', editable: true },
    { label: 'Type', fieldName: 'Veg_Non_Veg__c', type: 'text', editable: true },
    { label: 'Ingredients', fieldName: 'Ingredients__c', type: 'text', editable: true },
    { label: 'Prep Time', fieldName: 'Preparation_Time__c', type: 'number', editable: true },
    {
        type: 'action',
        typeAttributes: {
            rowActions: [{ label: 'Enable', name: 'enable', iconName: 'utility:check' }, { label: 'Disable', name: 'disable', iconName: 'utility:block' }, { label: 'Delete', name: 'delete', iconName: 'utility:delete' },
    { label: 'Is Disabled', fieldName: 'IsDisabled__c', type: 'boolean', editable: false },]
        }
    }
];

export default class MenuListComponent extends LightningElement {
    @track menuItems = [];
    @track draftValues = [];
    @track showModal = false;

    // Modal form fields
    @track name = '';
    @track price = 0;
    @track category = '';
    @track type = '';
    @track ingredients = '';
    @track prepTime = 0;

    wiredMenuItemsResult;

    categoryOptions = [
        { label: 'Appetizer', value: 'Appetizer' },
        { label: 'Main Course', value: 'Main Course' },
        { label: 'Dessert', value: 'Dessert' },
        { label: 'Beverage', value: 'Beverage' }
    ];

    typeOptions = [
        { label: 'Veg', value: 'Veg' },
        { label: 'Non-Veg', value: 'Non-Veg' }
    ];

    columns = COLUMNS;

    @wire(getMenuItems, { category: 'All' })
    wiredItems(result) {
        this.wiredMenuItemsResult = result;
        if (result.data) {
            this.menuItems = result.data;
        } else if (result.error) {
            this.showToast('Error', 'Failed to fetch menu items', 'error');
        }
    }

    // Modal control
    openModal() {
        this.showModal = true;
    }

    closeModal() {
        this.showModal = false;
        this.resetForm();
    }

    handleChange(event) {
        const field = event.target.dataset.id;
        this[field] = event.target.value;
    }

    handleAdd() {
        if (!this.name || !this.category || !this.type) {
            this.showToast('Validation Error', 'Please fill out all required fields', 'error');
            return;
        }

        addMenuItem({
            name: this.name,
            price: parseFloat(this.price),
            category: this.category,
            type: this.type,
            ingredients: this.ingredients,
            prepTime: parseInt(this.prepTime)
        })
        .then(result => {
            this.showToast('Success', `Item "${result.Name}" added`, 'success');
            this.closeModal();
            return refreshApex(this.wiredMenuItemsResult);
        })
        .catch(error => {
            this.showToast('Error', error.body.message, 'error');
        });
    }

    handleSave(event) {
        const updatedItem = event.detail.draftValues[0];
        updateMenuItem({ item: updatedItem })
            .then(() => {
                this.draftValues = [];
                this.showToast('Success', 'Item updated', 'success');
                return refreshApex(this.wiredMenuItemsResult);
            })
            .catch(error => {
                this.showToast('Error', error.body.message, 'error');
            });
    }

    handleRowAction(event) {
        const actionName = event.detail.action.name;
        const row = event.detail.row;

        
        if (actionName === 'enable') {
            const updated = { ...row, IsDisabled__c: false };
            updateMenuItem({ item: updated })
                .then(() => {
                    this.showToast('Success', 'Item enabled', 'success');
                    return refreshApex(this.wiredMenuItemsResult);
                })
                .catch(error => {
                    this.showToast('Error', error.body.message, 'error');
                });
        } else if (actionName === 'disable') {
            const updated = { ...row, IsDisabled__c: true };
            updateMenuItem({ item: updated })
                .then(() => {
                    this.showToast('Success', 'Item disabled', 'success');
                    return refreshApex(this.wiredMenuItemsResult);
                })
                .catch(error => {
                    this.showToast('Error', error.body.message, 'error');
                });
        } else
    
        if (actionName === 'delete') {
            deleteMenuItem({ itemId: row.Id })
                .then(() => {
                    this.showToast('Success', 'Item deleted', 'success');
                    return refreshApex(this.wiredMenuItemsResult);
                })
                .catch(error => {
                    this.showToast('Error', error.body.message, 'error');
                });
        }
    }

    resetForm() {
        this.name = '';
        this.price = 0;
        this.category = '';
        this.type = '';
        this.ingredients = '';
        this.prepTime = 0;
    }

    showToast(title, message, variant) {
        if (typeof message === 'string' && message.includes('$')) {
            message = message.replace('$', '₹');
        }
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}
