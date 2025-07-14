import { LightningElement, wire, track } from 'lwc';
import getMenuItems from '@salesforce/apex/MenuController.getMenuItems';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

export default class MenuComponent extends LightningElement {
    @track menuItems = [];
    @track selectedCategory = 'All';
    
    categoryOptions = [
        { label: 'All', value: 'All' },
        { label: 'Appetizer', value: 'Appetizer' },
        { label: 'Main Course', value: 'Main Course' },
        { label: 'Dessert', value: 'Dessert' },
        { label: 'Beverage', value: 'Beverage' }
    ];

    @wire(getMenuItems, { category: '$selectedCategory' })
    wiredMenuItems({ error, data }) {
        if (data) {
            this.menuItems = data;
        } else if (error) {
            this.showToast('Error', error.body.message, 'error');
        }
    }

    handleCategoryChange(event) {
        this.selectedCategory = event.detail.value;
    }

    handleAddToCart(event) {
        try {
            const menuItemId = event.currentTarget.dataset.id;
            const item = this.menuItems.find(i => i.Id === menuItemId);

            if (!item) {
                console.error('Menu item not found for ID:', menuItemId);
                return;
            }

            this.dispatchEvent(new CustomEvent('addtocart', {
                detail: {
                    id: item.Id,
                    name: item.Name,
                    price: item.Price__c
                },
                bubbles: true,
                composed: true
            }));
        } catch (error) {
            console.error('Error in handleAddToCart:', error);
            this.showToast('Error', 'Failed to add item to cart', 'error');
        }
    }



    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}