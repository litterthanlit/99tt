import Link from 'next/link'

export default function Home() {
  return (
    <main className="landing">
      <h1>09tt</h1>
      <p>Paint layers. Tell them how to move.</p>
      <Link className="button primary" href="/studio">New painting</Link>
    </main>
  )
}
