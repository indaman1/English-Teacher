import { LegalLayout } from '@/components/layout/LegalLayout';
import { usePageTitle } from '@/hooks/usePageTitle';

export default function Terms() {
  usePageTitle('Terms of Service', 'The terms for using AI English Teacher.');
  return (
    <LegalLayout title="Terms of Service" updated="October 2026">
      <p>By creating an account or using AI English Teacher you agree to these terms.</p>

      <h2>The service</h2>
      <p>
        AI English Teacher provides AI-powered spoken English practice. The teacher is an artificial intelligence and not a human. Its answers may be inaccurate, and the service is a
        learning aid, not a substitute for a qualified teacher or an official language examination.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>Provide accurate information and keep your password confidential.</li>
        <li>You are responsible for activity on your account.</li>
        <li>One person per account. Do not share accounts.</li>
      </ul>

      <h2>Acceptable use</h2>
      <ul>
        <li>Do not try to break, overload or reverse-engineer the service or bypass usage limits.</li>
        <li>Do not use the service to harass others or to produce unlawful, harmful or abusive content.</li>
        <li>Do not share other people's private information in lessons.</li>
      </ul>

      <h2>Plans and limits</h2>
      <p>
        Each plan includes a limit on daily and monthly speaking time and number of lessons. Limits are enforced on our servers and may change. Paid plans, if offered, will be described clearly
        before you are charged.
      </p>

      <h2>Your content</h2>
      <p>
        You own what you say and write. You allow us and our AI provider to process your lessons only to deliver the service to you, as described in the Privacy Policy.
      </p>

      <h2>Availability and changes</h2>
      <p>The service is provided “as is”. It may be unavailable at times, and features may change. We may suspend accounts that break these terms.</p>

      <h2>Limitation of liability</h2>
      <p>To the maximum extent permitted by law, we are not liable for indirect or consequential losses arising from use of the service, or for decisions you make relying on AI-generated content.</p>

      <h2>Ending your account</h2>
      <p>You can delete your account at any time from Settings. Deleting it permanently removes your associated data as described in the Privacy Policy.</p>
    </LegalLayout>
  );
}
