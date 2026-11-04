import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { Brand } from "@/components/brand";
import { db, schema } from "@/db";

export const metadata: Metadata = { title: "Syarat dan Ketentuan" };

/** Public terms of service (also the "terms of service link" of the Google sign-in consent screen). Indonesian only. */
export default async function TermsPage() {
  // The Super Admin runs the site, so their email is the contact.
  const [admin] = await db.select({ email: schema.user.email }).from(schema.user).where(eq(schema.user.isAdmin, true)).limit(1);
  const contact = admin?.email;

  return (
    <div className="mx-auto grid max-w-2xl gap-6 px-4 py-10 leading-relaxed">
      <Link href="/" className="w-fit">
        <Brand />
      </Link>
      <h1 className="text-3xl font-extrabold tracking-tight">Syarat dan Ketentuan</h1>
      <p className="text-sm text-muted-foreground">Berlaku sejak 4 November 2026.</p>
      <p>
        Dengan mendaftar atau memakai Harmoni Music Class (&quot;layanan&quot;), Anda menyetujui syarat berikut. Baca juga{" "}
        <Link href="/privacy" className="font-semibold text-primary underline">
          Kebijakan Privasi
        </Link>{" "}
        kami.
      </p>

      <Section title="1. Layanan">
        <p>Harmoni Music Class adalah aplikasi kelas musik untuk guru dan siswa: kelas, materi, kuis, latihan musik, perangkat ajar, dan fitur pendukung lainnya. Layanan disediakan oleh pengelola situs ini dan dapat berubah sewaktu-waktu.</p>
      </Section>

      <Section title="2. Akun">
        <ul className="list-disc space-y-1 pl-5">
          <li>Isi data akun dengan benar, termasuk nama dan, bagi guru, nama sekolah tempat mengajar.</li>
          <li>Akun guru baru aktif setelah disetujui pengelola. Pengelola boleh menolak pendaftaran tanpa memberi alasan.</li>
          <li>Jaga kerahasiaan kata sandi Anda. Anda bertanggung jawab atas aktivitas yang terjadi lewat akun Anda.</li>
          <li>Satu akun untuk satu orang. Jangan memakai akun orang lain.</li>
        </ul>
      </Section>

      <Section title="3. Kewajiban guru">
        <ul className="list-disc space-y-1 pl-5">
          <li>Guru bertanggung jawab atas kelas yang dibuatnya, siswa yang diundang, serta data siswa yang dikelolanya.</li>
          <li>Guru memastikan sekolah atau orang tua/wali tidak keberatan siswanya memakai layanan ini, sesuai aturan di sekolah masing-masing.</li>
          <li>Materi, soal, dan file yang diunggah harus milik guru sendiri atau boleh dipakai (misalnya berlisensi bebas atau sudah mendapat izin).</li>
        </ul>
      </Section>

      <Section title="4. Penggunaan yang dilarang">
        <ul className="list-disc space-y-1 pl-5">
          <li>Mengunggah konten yang melanggar hukum, hak cipta, SARA, pornografi, kekerasan, atau perundungan.</li>
          <li>Mencoba membobol, mengganggu, atau membebani server dan akun pengguna lain.</li>
          <li>Memakai layanan untuk iklan, spam, atau tujuan komersial di luar kegiatan belajar-mengajar tanpa izin pengelola.</li>
        </ul>
      </Section>

      <Section title="5. Fitur AI">
        <ul className="list-disc space-y-1 pl-5">
          <li>Fitur AI memakai API key milik guru sendiri (misalnya Google Gemini atau Anthropic). Biaya dan batas pemakaian mengikuti ketentuan penyedia AI tersebut dan menjadi tanggungan guru.</li>
          <li>Hasil AI bisa keliru. Guru wajib memeriksa dan menyunting hasil AI sebelum dipakai untuk mengajar atau menilai.</li>
          <li>Jangan memasukkan data pribadi siswa yang tidak perlu ke dalam permintaan AI.</li>
        </ul>
      </Section>

      <Section title="6. Ruang penyimpanan">
        <p>Setiap guru mendapat ruang upload terbatas yang ditentukan pengelola. Pengelola boleh mengubah batas ini demi menjaga kinerja server.</p>
      </Section>

      <Section title="7. Penangguhan dan penghapusan akun">
        <p>Pengelola boleh menonaktifkan atau menghapus akun yang melanggar syarat ini, tidak aktif dalam waktu lama, atau membahayakan layanan. Saat akun guru dihapus, kelas, materi, dan file miliknya ikut terhapus.</p>
      </Section>

      <Section title="8. Ketersediaan dan tanggung jawab">
        <p>
          Layanan diberikan &quot;sebagaimana adanya&quot;. Kami berusaha menjaga layanan tetap berjalan dan data tetap aman, tetapi tidak menjamin layanan selalu tersedia atau bebas kesalahan. Simpan salinan materi penting Anda sendiri (misalnya
          lewat fitur unduh .docx). Sejauh diizinkan hukum, pengelola tidak bertanggung jawab atas kerugian akibat gangguan layanan, kehilangan data, atau hasil AI.
        </p>
      </Section>

      <Section title="9. Perubahan">
        <p>Syarat ini bisa diperbarui. Tanggal di atas menunjukkan versi terbaru. Dengan tetap memakai layanan setelah perubahan, Anda dianggap menyetujui syarat yang baru.</p>
      </Section>

      <Section title="10. Kontak">
        <p>
          Pertanyaan tentang syarat ini bisa dikirim ke{" "}
          {contact ? (
            <a href={`mailto:${contact}`} className="font-semibold text-primary underline">
              {contact}
            </a>
          ) : (
            "pengelola situs ini"
          )}
          .
        </p>
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
