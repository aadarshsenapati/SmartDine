import { LightningElement, track } from 'lwc';
import getDishesFromBill from '@salesforce/apex/FeedbackController.getDishesFromBill';
import submitDishFeedback from '@salesforce/apex/FeedbackController.submitDishFeedback';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

export default class MultiDishFeedback extends LightningElement {
    billId;
    @track isSubmitted = false;
    @track dishes = [];
    dishRatings = {};
    dishComments = {};
    starValues = [1, 2, 3, 4, 5];

    connectedCallback() {
        this.billId = new URLSearchParams(window.location.search).get('billId');
        if (this.billId) {
            getDishesFromBill({ billId: this.billId })
                .then(result => {
                    this.dishes = result;
                })
                .catch(error => {
                    this.showToast('Error', 'Failed to load dishes', 'error');
                    console.error('Dish loading error:', error);
                });
        }
    }

    handleRatingChange(event) {
        const id = event.target.dataset.id;
        this.dishRatings[id] = parseInt(event.detail.value);
    }

    handleCommentChange(event) {
        const id = event.target.dataset.id;
        this.dishComments[id] = event.detail.value;
    }

    async submitFeedback() {
        let errors = [];

        for (let dish of this.dishes) {
            const rating = this.dishRatings[dish.id];
            const comments = this.dishComments[dish.id] || '';

            if (!rating || rating < 1 || rating > 5) {
                errors.push(dish.name);
                continue;
            }

            try {
                await submitDishFeedback({
                    billId: this.billId,
                    menuItemId: dish.id,
                    rating,
                    comments
                });
            } catch (e) {
                console.error('Submission error for', dish.name, e);
                this.showToast('Error', `Failed to submit for ${dish.name}`, 'error');
            }
        }

        if (errors.length) {
            this.showToast('Missing Ratings', `Please rate: ${errors.join(', ')}`, 'warning');
        } else {
            this.showToast('Thank You!', 'All feedback submitted successfully.', 'success');
            this.isSubmitted = true; // ✅ Show thank you message
            this.dishRatings = {};
            this.dishComments = {};
        }
    }

    get noDishes() {
        return this.dishes.length === 0;
    }

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
    handleStarClick(event) {
        const dishId = event.currentTarget.dataset.id;
        const starValue = parseInt(event.currentTarget.dataset.star, 10);
        this.dishRatings[dishId] = starValue;

        // Update UI: force re-render
        this.dishes = [...this.dishes];
    }
    getUniqueKey(dishId, star) {
        return `${dishId}_${star}`;
    }
    getStarClass(dishId, starNumber) {
        const currentRating = this.dishRatings[dishId] || 0;
        return starNumber <= currentRating ? 'star filled' : 'star';
    }
    generateStarModels() {
        this.dishes = this.dishes.map(dish => {
            const rating = this.dishRatings[dish.id] || 0;
            const stars = [1, 2, 3, 4, 5].map(i => ({
                value: i,
                className: i <= rating ? 'star filled' : 'star'
            }));
            return { ...dish, stars };
        });
    }

    handleStarClick(event) {
        const dishId = event.currentTarget.dataset.id;
        const starValue = parseInt(event.currentTarget.dataset.star, 10);
        this.dishRatings[dishId] = starValue;
        this.generateStarModels(); // Force re-render with updated stars
    }




}
