import LoginForm from './LoginForm';
import Icon from '@/components/ui/Icon';

export default function LoginPage() {
  return (
    <main className="login-page">
      <div className="login-wrap">
        <span className="login-brand"><span className="brand-icon"><Icon name="microphone" size={18} /></span> Werkoffertes</span>
        <h1 className="page-title">Van werfbezoek naar offerte.</h1>
        <p className="page-subtitle mb-7">Spreek de klus in, kijk de prijzen na en verstuur je offerte.</p>
        <LoginForm />
      </div>
    </main>
  );
}
