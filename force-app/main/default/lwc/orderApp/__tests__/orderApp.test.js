import { createElement } from '@lwc/engine-dom';
import OrderApp from 'c/orderApp';

describe('c-order-app', () => {
    afterEach(() => {
        // The jsdom instance is shared across test cases in a single file so reset the DOM
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('TODO: test case generated by CLI command, please fill in test logic', () => {
        // Arrange
        const element = createElement('c-order-app', {
            is: OrderApp
        });

        // Act
        document.body.appendChild(element);

        // Assert
        // const div = element.shadowRoot.querySelector('div');
        expect(1).toBe(1);
    });

    it('should render the component', () => {
        const element = createElement('c-order-app', {
            is: OrderApp
        });
        document.body.appendChild(element);
        expect(element).toBeTruthy();
    });

    it('should handle add to cart event', () => {
        const element = createElement('c-order-app', {
            is: OrderApp
        });
        document.body.appendChild(element);

        // Mock the addToCart method of the order component
        const orderComponent = element.shadowRoot.querySelector('c-order-component');
        const addToCartSpy = jest.spyOn(orderComponent, 'addToCart');

        // Dispatch the addtocart event from the menu component
        const menuComponent = element.shadowRoot.querySelector('c-menu-component');
        menuComponent.dispatchEvent(new CustomEvent('addtocart', { detail: 'menuItem123' }));

        // Ensure addToCart was called with the correct argument
        expect(addToCartSpy).toHaveBeenCalledWith('menuItem123');
    });

    it('should handle place order event', () => {
        const element = createElement('c-order-app', {
            is: OrderApp
        });
        document.body.appendChild(element);

        // Mock the handlePlaceOrder method
        const handlePlaceOrderSpy = jest.spyOn(element, 'handlePlaceOrder');

        // Dispatch the placeorder event from the order component
        const orderComponent = element.shadowRoot.querySelector('c-order-component');
        orderComponent.dispatchEvent(new CustomEvent('placeorder'));

        // Ensure handlePlaceOrder was called
        expect(handlePlaceOrderSpy).toHaveBeenCalled();
    });
});