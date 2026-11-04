import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { Brand } from "@/components/brand";
import { db, schema } from "@/db";

export const metadata: Metadata = { title: "Kebijakan Privasi" };

/** Public privacy policy (also the "privacy policy URL" of the Google sign-in consent screen). Indonesian only. */
export default async function PrivacyPage() {
  // The Super Admin runs the site, so their email is the contact for privacy questions.
  const [admin] = await db.select({ email: schema.user.email }).from(schema.user).where(eq(schema.user.isAdmin, true)).limit(1);
  const contact = admin?.email;

  return (
    <div className="mx-auto grid max-w-2xl gap-6 px-4 py-10 leading-relaxed">
      <Link href="/" className="w-fit">
        <Brand />
      </Link>
      <h1 className="text-3xl font-extrabold tracking-tight">Kebijakan Privasi</h1>
      <p className="text-sm text-muted-foreground">Berlaku sejak 4 November 2026.</p>

      <Section title="Tentang layanan ini">
        <p>Harmoni Music Class adalah aplikasi kelas musik untuk guru dan siswa: kelas, materi, kuis, latihan musik, dan perangkat ajar. Halaman ini menjelaskan data apa yang kami simpan dan untuk apa.</p>
      </Section>

      <Section title="Data yang kami kumpulkan">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <b>Data akun:</b> nama, email atau username, dan kata sandi (disimpan dalam bentuk hash, tidak bisa dibaca).
          </li>
          <li>
            <b>Masuk dengan Google (khusus guru):</b> kami hanya menerima nama, alamat email, dan foto profil dari akun Google Anda. Kami tidak mengakses Gmail, Drive, kontak, atau data Google lainnya.
          </li>
          <li>
            <b>Data belajar:</b> kelas yang diikuti, jawaban kuis, nilai, kehadiran, hasil latihan, dan rekaman latihan yang diunggah siswa.
          </li>
          <li>
            <b>Konten guru:</b> materi, soal, perangkat ajar, jadwal, jurnal, dan file (gambar, audio, video) yang diunggah guru.
          </li>
        </ul>
      </Section>

      <Section title="Untuk apa data dipakai">
        <ul className="list-disc space-y-1 pl-5">
          <li>Menjalankan aplikasi: masuk ke akun, menampilkan kelas dan materi, menilai kuis, dan mencatat kemajuan belajar.</li>
          <li>Guru melihat data belajar siswa di kelasnya sendiri. Guru tidak bisa melihat data kelas guru lain.</li>
          <li>Mengirim email atur ulang kata sandi bila Anda memintanya.</li>
        </ul>
        <p>Kami tidak menjual data dan tidak memakainya untuk iklan.</p>
      </Section>

      <Section title="Fitur AI">
        <p>
          Fitur AI (misalnya pembuat perangkat ajar, soal, dan materi) mengirim teks yang diminta guru ke penyedia AI yang dipilih guru tersebut (misalnya Google Gemini atau Anthropic) memakai kunci API milik guru itu sendiri. Untuk analisis
          hasil latihan, nama siswa diganti kode anonim sebelum dikirim ke AI.
        </p>
      </Section>

      <Section title="Penyimpanan dan keamanan">
        <p>Data disimpan di server aplikasi ini dan dikirim lewat koneksi terenkripsi (HTTPS). Kunci API AI milik guru disimpan dalam bentuk terenkripsi.</p>
      </Section>

      <Section title="Menghapus data">
        <p>
          Anda bisa meminta akun dan data Anda dihapus{contact ? (
            <>
              {" "}
              dengan menghubungi{" "}
              <a href={`mailto:${contact}`} className="font-semibold text-primary underline">
                {contact}
              </a>
            </>
          ) : (
            " dengan menghubungi pengelola situs ini"
          )}
          . Siswa juga bisa meminta lewat gurunya. Saat akun guru dihapus, kelas, materi, dan file miliknya ikut terhapus.
        </p>
      </Section>

      <Section title="Perubahan">
        <p>Kebijakan ini bisa diperbarui. Tanggal di atas menunjukkan versi terbaru.</p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-2">
      <h2 className="text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}
