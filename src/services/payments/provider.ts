// Payment abstraction. NO payment provider is integrated yet, and nothing here charges anyone.
// When Paystack (Nigeria) or Stripe (international) is added, implement this interface in a
// server-side Edge Function and let the provider webhook update public.user_subscriptions with the
// service role. The browser must never decide a user's plan.

export type PaymentProviderName = 'paystack' | 'stripe';

export interface CheckoutRequest {
  planCode: 'premium';
  provider: PaymentProviderName;
  successUrl: string;
  cancelUrl: string;
}

export interface PaymentProvider {
  readonly name: PaymentProviderName;
  /** Returns a hosted checkout URL created on the server. */
  createCheckoutSession(userId: string, request: CheckoutRequest): Promise<{ url: string }>;
  /** Returns a hosted billing-portal URL where the user can manage or cancel. */
  createPortalSession(userId: string, returnUrl: string): Promise<{ url: string }>;
}

/** Billing is considered available only when the operator has connected a provider server-side. */
export const PAYMENTS_ENABLED = false;
