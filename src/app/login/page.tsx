import LoginForm from './LoginForm';

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <h1 className="mb-1 text-3xl font-semibold">Offertes</h1>
      <p className="mb-8 text-muted">Spraakgestuurde offertes voor dakwerkers.</p>
      <LoginForm />
    </main>
  );
}
