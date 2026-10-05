TRIV - SISTEM DEPOSIT/ADMIN

Fungsi:
- Member daftar/login.
- Member memilih bank dari daftar bank Indonesia.
- Member menyimpan rekening bank untuk withdrawal.
- Admin menambah, menonaktifkan, dan mengganti tujuan rekening deposit (edit dilakukan dengan menonaktifkan lalu menambah rekening baru).
- Deposit selalu PENDING.
- Deposit TIDAK menambah saldo saat diajukan.
- Admin SETUJUI -> saldo bertambah satu kali.
- Admin TOLAK -> saldo tetap.
- Withdrawal mengurangi/menahan saldo saat diajukan; jika admin menolak, saldo dikembalikan.
- Tidak ada fitur lokasi.

Admin awal:
admin@triv.web.id
TrivAdmin@2026!

Setup:
1. Buat Google Apps Script.
2. Tempel Code.gs.
3. Jalankan fungsi setup() sekali.
4. Deploy sebagai Web App, Execute as Me, access Anyone.
5. Ambil URL /exec.
6. Ganti GANTI_URL_APPS_SCRIPT di index.html dan admin.html.
7. Upload index.html ke root GitHub Pages.
8. Upload admin.html.
9. Untuk uang nyata, sambungkan approval withdrawal ke payment gateway/bank resmi; approve di panel tidak mengirim transfer bank otomatis.
