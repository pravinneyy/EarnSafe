import { Platform } from 'react-native';

let webSdkPromise = null;

function getWindowObject() {
  if (typeof window === 'undefined') {
    throw new Error('Razorpay web checkout is unavailable in this environment.');
  }
  return window;
}

function loadWebSdk() {
  if (Platform.OS !== 'web') {
    return Promise.resolve();
  }

  if (webSdkPromise) {
    return webSdkPromise;
  }

  webSdkPromise = new Promise((resolve, reject) => {
    const win = getWindowObject();
    if (win.Razorpay) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Unable to load the Razorpay checkout SDK.'));
    document.body.appendChild(script);
  });

  return webSdkPromise;
}

function getNativeCheckout() {
  const razorpayModule = require('react-native-razorpay');
  return razorpayModule.default ?? razorpayModule;
}

function buildCheckoutOptions(order, user) {
  return {
    key: order.key_id,
    amount: order.amount,
    currency: order.currency,
    name: order.name,
    description: order.description,
    order_id: order.order_id,
    prefill: {
      name: user?.name || '',
      contact: user?.phone || '',
    },
    notes: {
      user_id: String(user?.id || ''),
      plan_tier: order.quote?.plan_tier || '',
      quote_id: order.quote?.id || '',
    },
    theme: {
      color: '#10B981',
    },
  };
}

function openWebCheckout(options) {
  return new Promise(async (resolve, reject) => {
    try {
      await loadWebSdk();
    } catch (error) {
      reject(error);
      return;
    }

    const win = getWindowObject();
    const checkout = new win.Razorpay({
      ...options,
      handler: resolve,
      modal: {
        ondismiss: () => reject(new Error('Payment cancelled')),
      },
    });

    checkout.on('payment.failed', response => {
      const description = response?.error?.description || 'Payment failed';
      reject(new Error(description));
    });

    checkout.open();
  });
}

export async function openRazorpayCheckout(order, user) {
  const options = buildCheckoutOptions(order, user);

  if (Platform.OS === 'web') {
    return openWebCheckout(options);
  }

  const RazorpayCheckout = getNativeCheckout();
  return RazorpayCheckout.open(options);
}

export function isPaymentCancellation(error) {
  const text = [
    error?.description,
    error?.message,
    error?.reason,
    error?.error?.description,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return text.includes('cancel') || text.includes('dismiss');
}

export function getPaymentErrorMessage(error) {
  return (
    error?.description ||
    error?.message ||
    error?.reason ||
    error?.error?.description ||
    'Unable to complete the payment.'
  );
}