// force-app/main/default/lwc/pubsub/pubsub.js
const events = {};

const registerListener = (eventName, callback, thisArg) => {
    if (!events[eventName]) {
        events[eventName] = [];
    }
    events[eventName].push({ callback, thisArg });
};

const unregisterListener = (eventName, callback, thisArg) => {
    if (events[eventName]) {
        events[eventName] = events[eventName].filter(
            listener => listener.callback !== callback || listener.thisArg !== thisArg
        );
    }
};

const unregisterAllListeners = (thisArg) => {
    Object.keys(events).forEach(eventName => {
        events[eventName] = events[eventName].filter(
            listener => listener.thisArg !== thisArg
        );
    });
};

const fireEvent = (eventName, payload) => {
    if (events[eventName]) {
        events[eventName].forEach(listener => {
            try {
                listener.callback.call(listener.thisArg, payload);
            } catch (error) {
                // Fail silently
            }
        });
    }
};

export {
    registerListener,
    unregisterListener,
    unregisterAllListeners,
    fireEvent
};