import { useState, useEffect } from "react";
import { X, CheckCircle2, FileCheck } from "lucide-react";
import {
  saveAppraisalSelf, saveAppraisalApprover, loadAllAppraisalApprovers, loadAppraisalSelf,
} from "../shared/appraisalFormStore";
import { loadPersistedState, savePersistedState } from "../../services/supabaseClient";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Indicator = { score: 1 | 2 | 3 | 4 | 5; label: string; text: string };

export type FormItem = {
  no: number;
  label: string;       // bold prefix (e.g. "Pengetahuan Kerja:")
  description: string; // rest of text
  indicators: Indicator[];
};

export type FormDef = {
  id: "A" | "B" | "C";
  tab: string;
  subtitle: string;
  title: string;
  sectionTitle: string;
  percentage: number;
  hasEvaluasiAtasan: boolean;
  items: FormItem[];
};

// ─── Data ─────────────────────────────────────────────────────────────────────

export const FORMS: FormDef[] = [
  // ── FORM A ─────────────────────────────────────────────────────────────────
  {
    id: "A",
    tab: "Form A",
    subtitle: "Kompetensi Kerja & Keterampilan Fungsional",
    title: "Form A",
    sectionTitle: "BAGIAN A - KOMPETENSI KERJA & KETERAMPILAN FUNGSIONAL",
    percentage: 60,
    hasEvaluasiAtasan: false,
    items: [
      {
        no: 1,
        label: "Pengetahuan Kerja:",
        description: "Memahami tugasnya, tanggung jawabnya, memiliki kemampuan untuk memanfaatkan bahan, menerapkan pengetahuan tentang metode, teknik, dan keterampilan ke dalam pekerjaan.",
        indicators: [
          { score: 1, label: "Nilai 1", text: "Tidak memahami tugas dan tanggung jawabnya serta tidak memiliki keterampilan dalam pekerjaannya" },
          { score: 2, label: "Nilai 2", text: "Mampu memahami tugas dan tanggung jawabnya namun masih membutuhkan pengembangan untuk menerapkan pengetahuan dan keterampilan dalam pekerjaannya" },
          { score: 3, label: "Nilai 3", text: "Mampu memahami tugas dan tanggung jawabnya serta telah memiliki kemampuan untuk menerapkan pengetahuan dan keterampilan dalam pekerjaannya" },
          { score: 4, label: "Nilai 4", text: "Mampu memahami tugas dan tanggung jawabnya dan mampu menghasilkan ide/metode baru untuk diterapkan dalam pekerjaannya" },
          { score: 5, label: "Nilai 5", text: "Mampu memahami tugas dan tanggung jawabnya dan memiliki berbagai metode, teknik dan keterampilan yang beragam sebagai alternatif pilihan untuk diterapkan dalam pekerjaannya" },
        ],
      },
      {
        no: 2,
        label: "Produktivitas & Efisiensi:",
        description: "Kemampuan untuk menyelesaikan tugas yang diberikan dalam kerangka waktu yang diizinkan secara efisien dan mengatasi masalah dengan tepat.",
        indicators: [
          { score: 1, label: "Nilai 1", text: "Tidak mampu menyelesaikan tugas yang diberikan dan mengatasi masalah yang ada dengan solusi yang tepat secara efisien sesuai dengan kerangka waktu yang ditetapkan" },
          { score: 2, label: "Nilai 2", text: "Mampu menyelesaikan tugas yang diberikan namun tidak mampu mengatasi masalah yang ada dengan solusi yang tepat secara efisien sesuai dengan kerangka waktu yang ditetapkan" },
          { score: 3, label: "Nilai 3", text: "Mampu menyelesaikan tugas yang diberikan dan mengatasi masalah yang ada dengan solusi yang tepat secara efisien sesuai dengan kerangka waktu yang ditetapkan" },
          { score: 4, label: "Nilai 4", text: "Mampu menyelesaikan tugas yang diberikan dan mengatasi masalah yang ada dengan solusi yang tepat secara efisien lebih cepat dari kerangka waktu yang ditetapkan" },
          { score: 5, label: "Nilai 5", text: "Mampu menyelesaikan seluruh tugas baik itu yang diberikan ataupun tidak dan mengatasi masalah yang ada dengan solusi yang tepat dan beragam secara efisien lebih cepat dari kerangka waktu yang ditetapkan" },
        ],
      },
      {
        no: 3,
        label: "Kualitas Kerja:",
        description: "Akurasi kerja; didukung dengan kemampuan untuk menciptakan hasil kerja yang cermat, dapat dipertanggungjawabkan, serta sesuai dengan tujuan organisasi/jabatan.",
        indicators: [
          { score: 1, label: "Nilai 1", text: "Tidak mampu memberikan hasil kerja akurat dan sesuai dengan tujuan organisasi/jabatan" },
          { score: 2, label: "Nilai 2", text: "Mampu memberikan hasil kerja walaupun kurang akurat namun hasil kerja tersebut telah sesuai dengan arah tujuan organisasi/jabatan" },
          { score: 3, label: "Nilai 3", text: "Mampu memberikan hasil kerja akurat dan sudah sesuai dengan tujuan organisasi/jabatan" },
          { score: 4, label: "Nilai 4", text: "Mampu memberikan dan mempertanggungjawabkan hasil kerja yang akurat dan sesuai dengan tujuan organisasi/jabatan" },
          { score: 5, label: "Nilai 5", text: "Mampu memberikan, menjelaskan dan mempertanggungjawabkan hasil kerja yang akurat dengan metode berbeda yang digunakan yang sangat sesuai dengan tujuan organisasi/jabatan" },
        ],
      },
      {
        no: 4,
        label: "Keterampilan Teknis:",
        description: "Memiliki kecakapan teknis untuk melakukan hal-hal yang berkaitan dengan pekerjaannya; seperti permesinan, hal-hal yang berkaitan dengan komputer atau hal ilmiah, maupun yang berkaitan dengan teknologi atau sejenisnya.",
        indicators: [
          { score: 1, label: "Nilai 1", text: "Tidak mampu melakukan pekerjaan yang berkaitan dengan komputer, teknologi, atau hal-hal ilmiah dan sejenisnya" },
          { score: 2, label: "Nilai 2", text: "Memiliki pengetahuan terkait dengan komputer, teknologi, atau hal-hal ilmiah dan sejenisnya namun membutuhkan pengembangan lebih untuk menerapkan langsung pada pekerjaannya" },
          { score: 3, label: "Nilai 3", text: "Memiliki pengetahuan dan keahlian teknis terkait dengan komputer, teknologi, atau hal-hal ilmiah dan sejenisnya untuk diterapkan pada pekerjaannya" },
          { score: 4, label: "Nilai 4", text: "Memiliki pengetahuan dan keahlian teknis terkait dengan komputer, teknologi, atau hal-hal ilmiah dan sejenisnya dan terus mengembangkannya dengan belajar mandiri atau mengikuti pelatihan untuk keperluan penyelesaian pekerjaan" },
          { score: 5, label: "Nilai 5", text: "Memiliki pengetahuan dan keahlian teknis terkait dengan komputer, teknologi, atau hal-hal ilmiah dan sejenisnya untuk diterapkan bukan hanya pada pekerjaannya saja tetapi juga kegiatan lainnya di luar lingkup pekerjaan" },
        ],
      },
      {
        no: 5,
        label: "Manajemen Kerja:",
        description: "Kemampuan untuk menerapkan struktur alur kerja untuk pergerakan informasi, serta untuk interaksi proses bisnis dengan proses kerja internal untuk menghasilkan informasi.",
        indicators: [
          { score: 1, label: "Nilai 1", text: "Tidak mampu menerapkan alur kerja yang baik" },
          { score: 2, label: "Nilai 2", text: "Mampu menerapkan alur kerja yang baik namun belum sampai pada tahap membangun interaksi antara proses bisnis dengan proses kerja internal untuk menghasilkan informasi" },
          { score: 3, label: "Nilai 3", text: "Mampu menerapkan alur kerja yang baik untuk membangun interaksi antara proses bisnis dengan proses kerja internal untuk menghasilkan informasi" },
          { score: 4, label: "Nilai 4", text: "Mampu membuat dan menerapkan alur kerja yang baik untuk membangun interaksi antara proses bisnis dengan proses kerja internal untuk menghasilkan informasi" },
          { score: 5, label: "Nilai 5", text: "Mampu membuat, menerapkan dan mengembangkan alur kerja yang baik sesuai dengan kebutuhan kerja untuk membangun interaksi antara proses bisnis dengan proses kerja internal untuk menghasilkan informasi" },
        ],
      },
      {
        no: 6,
        label: "Pengelolaan Waktu:",
        description: "Kemampuan menggunakan waktu secara efektif / produktif, mampu memprioritaskan pekerjaan dan diselesaikan sesuai jadwal.",
        indicators: [
          { score: 1, label: "Nilai 1", text: "Tidak mampu menggunakan waktu dengan efektif/produktif sehingga tidak mampu membuat jadwal pekerjaan sesuai dengan prioritas" },
          { score: 2, label: "Nilai 2", text: "Mampu membuat skala prioritas pekerjaan namun belum dapat menggunakan waktu secara efektif/produktif untuk menyelesaikan pekerjaan sesuai dengan jadwal" },
          { score: 3, label: "Nilai 3", text: "Mampu menggunakan waktu dengan efektif/produktif untuk menyelesaikan pekerjaan sesuai dengan skala prioritas yang telah dibuat" },
          { score: 4, label: "Nilai 4", text: "Mampu menggunakan waktu dengan efektif/produktif sehingga mampu menyelesaikan pekerjaan lain di luar skala prioritas yang telah dibuat" },
          { score: 5, label: "Nilai 5", text: "Mampu menggunakan waktu dengan efektif/produktif sehingga mampu membuat metode penentuan skala prioritas yang dapat dibagikan kepada orang lain untuk membantu orang lain menyelesaikan pekerjaannya masing-masing" },
        ],
      },
      {
        no: 7,
        label: "Kemampuan Pemecahan Masalah:",
        description: "Mampu menimbang dan mengevaluasi informasi secara realistis, mengidentifikasi tingkat kepentingan, menilai berbagai konsekuensi yang mungkin terjadi dan mengambil tindakan yang sesuai. Menunjukkan kemampuan untuk membuat keputusan yang tepat dan tepat waktu, pertanggungjawaban atas hasil dan memilih keputusan lain yang memenuhi tujuan departemen / perusahaan.",
        indicators: [
          { score: 1, label: "Nilai 1", text: "Tidak mampu menimbang dan mengevaluasi informasi secara realistis, mengidentifikasi kepentingan, menilai konsekuensi dan mengambil keputusan yang tepat dan cepat" },
          { score: 2, label: "Nilai 2", text: "Mampu menimbang dan mengevaluasi informasi secara realistis, mengidentifikasi kepentingan, menilai konsekuensi, namun membutuhkan waktu yang lebih lama untuk membuat keputusan yang tepat" },
          { score: 3, label: "Nilai 3", text: "Mampu menimbang dan mengevaluasi informasi secara realistis, mengidentifikasi kepentingan, menilai konsekuensi dan membuat keputusan yang tepat untuk tujuan departemen/perusahaan" },
          { score: 4, label: "Nilai 4", text: "Mampu menimbang dan mengevaluasi informasi secara realistis, mengidentifikasi kepentingan, dan membuat keputusan yang tepat untuk tujuan departemen/perusahaan serta bartanggung jawab atas konsekuensi yang mungkin terjadi karena keputusan yang diambil" },
          { score: 5, label: "Nilai 5", text: "Mampu mencari dan mengevaluasi informasi secara realistis, mengidentifikasi kepentingan dan mengambil keputusan secara cepat dan tepat sesuai dengan tujuan departemen/perusahaan serta bartanggung jawab atas konsekuensi yang akan dihasilkan dari keputusan tersebut" },
        ],
      },
      {
        no: 8,
        label: "Tanggung Jawab:",
        description: "Dapat dipercaya untuk bekerja, terkadang tanpa adanya pengawasan ketat, dan tetap bertanggung jawab terhadap pekerjaan yang harus diselesaikan.",
        indicators: [
          { score: 1, label: "Nilai 1", text: "Tidak dapat dipercaya ketika bekerja tanpa adanya pengawasan ketat" },
          { score: 2, label: "Nilai 2", text: "Dapat dipercaya untuk bekerja tanpa adanya pengawasan ketat namun harus dilakukan pengembangan untuk selalu bertanggung jawab menyelesaikan pekerjaan yang harus diselesaikan" },
          { score: 3, label: "Nilai 3", text: "Dapat dipercaya untuk bekerja tanpa adanya pengawasan ketat, dan bertanggung jawab terhadap pekerjaan yang harus diselesaikan" },
          { score: 4, label: "Nilai 4", text: "Dapat dipercaya untuk bekerja tanpa adanya pengawasan dari atasan dalam bentuk apapun, selalu melaporkan progress pekerjaan kepada atasan sebagai bentuk pertanggungjawaban pada pekerjaan yang harus diselesaikan" },
          { score: 5, label: "Nilai 5", text: "Dapat dipercaya untuk bekerja menyelesaikan pekerjaan sendiri dan membantu pekerjaan rekan kerja tanpa adanya pengawasan dari atasan dalam bentuk apapun, selalu melaporkan progress pekerjaan kepada atasan sebagai bentuk pertanggungjawaban pada pekerjaan yang harus diselesaikan" },
        ],
      },
      {
        no: 9,
        label: "Sikap terhadap Perubahan dan Peningkatan:",
        description: "Mengukur efektivitas dalam perubahan yang dimulai, beradaptasi terhadap perubahan-perubahan penting dari penggunaan metode lama ke baru ketika metode lama sudah tidak relevan, mengidentifikasi metode-metode baru, dan menghasilkan peningkatan kinerja di tempat kerja sekarang.",
        indicators: [
          { score: 1, label: "Nilai 1", text: "Tidak mampu beradaptasi terhadap perubahan penting dari penggunaan metode lama yang sudah tidak relevan menjadi metode baru dan menghasilkan peningkatan kerja di tempat kerja" },
          { score: 2, label: "Nilai 2", text: "Mampu beradaptasi terhadap perubahan penting dari penggunaan metode lama yang sudah tidak relevan menjadi metode baru, namun belum dapat menghasilkan peningkatan kerja di tempat kerja" },
          { score: 3, label: "Nilai 3", text: "Mampu beradaptasi terhadap perubahan penting dari penggunaan metode lama yang sudah tidak relevan menjadi metode baru dan menghasilkan peningkatan kerja di tempat kerja" },
          { score: 4, label: "Nilai 4", text: "Mampu beradaptasi terhadap perubahan penting dari penggunaan metode lama yang sudah tidak relevan menjadi metode baru, mengidentifikasi metode-metode baru dan menghasilkan peningkatan kerja di tempat kerja" },
          { score: 5, label: "Nilai 5", text: "Mampu beradaptasi terhadap perubahan penting dari penggunaan metode lama yang sudah tidak relevan menjadi metode baru, mengidentifikasi metode-metode baru, mengajarkan penggunaan metode baru kepada orang lain dan bersama menghasilkan peningkatan kerja di tempat kerja" },
        ],
      },
      {
        no: 10,
        label: "Mempelajari dan Menggunakan Keterampilan Baru:",
        description: "Menunjukkan kemampuan untuk menangkap informasi/keterampilan baru dalam jangka waktu yang masuk akal dan dapat menerapkannya di waktu yang tepat.",
        indicators: [
          { score: 1, label: "Nilai 1", text: "Tidak mampu menangkap informasi/keterampilan baru dalam jangka waktu yang masuk akal dan dapat menerapkannya di waktu yang tepat" },
          { score: 2, label: "Nilai 2", text: "Mampu menangkap informasi/keterampilan baru dalam jangka waktu yang masuk akal, namun belum dapat menerapkannya di waktu yang tepat" },
          { score: 3, label: "Nilai 3", text: "Mampu menangkap informasi/keterampilan baru dalam jangka waktu yang masuk akal dan dapat menerapkannya di waktu yang tepat" },
          { score: 4, label: "Nilai 4", text: "Mampu menangkap informasi/keterampilan baru dalam jangka waktu cepat dibandingkan dengan orang lain dan dapat menerapkannya di waktu yang tepat" },
          { score: 5, label: "Nilai 5", text: "Mampu menangkap informasi/keterampilan baru dalam jangka waktu cepat dibandingkan dengan orang lain dan dapat langsung menerapkannya di waktu dan kondisi yang tepat" },
        ],
      },
      {
        no: 11,
        label: "Partisipasi:",
        description: "Menunjukkan keikutsertaan, ketertarikan, keterlibatan, dan kontribusi dalam diskusi terkait produk, pekerjaan, dan sebagainya, serta menghasilkan berbagai ide kreatif dan solusi.",
        indicators: [
          { score: 1, label: "Nilai 1", text: "Tidak menunjukkan keikutsertaan, ketertarikan, keterlibatan dan kontribusi dalam diskusi terkait produk, pekerjaan dan sebagainya, serta menghasilkan berbagai ide kreatif dan solusi" },
          { score: 2, label: "Nilai 2", text: "Mampu menunjukkan keikutsertaan, ketertarikan, keterlibatan dan kontribusi dalam diskusi terkait produk, pekerjaan dan sebagainya, namun belum dapat menghasilkan berbagai ide kreatif dan solusi" },
          { score: 3, label: "Nilai 3", text: "Mampu menunjukkan keikutsertaan, ketertarikan, keterlibatan dan kontribusi dalam diskusi terkait produk, pekerjaan dan sebagainya, serta menghasilkan berbagai ide kreatif dan solusi" },
          { score: 4, label: "Nilai 4", text: "Mampu menunjukkan keikutsertaan, ketertarikan, keterlibatan dan kontribusi dalam diskusi terkait produk, pekerjaan dan sebagainya, serta menghasilkan berbagai ide kreatif dan solusi yang dapat diterapkan sesuai dengan kondisi perusahaan" },
          { score: 5, label: "Nilai 5", text: "Mampu menunjukkan keikutsertaan, ketertarikan, keterlibatan dan kontribusi dalam diskusi terkait produk, pekerjaan dan sebagainya, serta menghasilkan berbagai ide kreatif dan dapat langsung menerapkan ide tersebut di dalam perusahaan" },
        ],
      },
      {
        no: 12,
        label: "Responsivitas Pelanggan:",
        description: "Kualitas reaksi secara cepat terhadap pertanyaan dari staf internal, pelanggan, supplier dan rekan kerja.",
        indicators: [
          { score: 1, label: "Nilai 1", text: "Tidak mampu bereaksi secara cepat terhadap pertanyaan dari staf internal, pelanggan, supplier dan rekan kerja" },
          { score: 2, label: "Nilai 2", text: "Mampu bereaksi secara tepat namun belum cukup cepat terhadap pertanyaan dari staf internal, pelanggan, supplier dan rekan kerja" },
          { score: 3, label: "Nilai 3", text: "Mampu bereaksi secara cepat terhadap pertanyaan dari staf internal, pelanggan, supplier dan rekan kerja" },
          { score: 4, label: "Nilai 4", text: "Mampu bereaksi secara cepat dan tepat terhadap pertanyaan dari staf internal, pelanggan, supplier dan rekan kerja" },
          { score: 5, label: "Nilai 5", text: "Mampu bereaksi secara cepat dan tepat terhadap pertanyaan dari staf internal, pelanggan, supplier dan rekan kerja dan memberikan solusi atas semua permasalahan yang ada" },
        ],
      },
    ],
  },

  // ── FORM B ─────────────────────────────────────────────────────────────────
  {
    id: "B",
    tab: "Form B",
    subtitle: "Kepribadian",
    title: "Form B",
    sectionTitle: "BAGIAN B - KEPRIBADIAN",
    percentage: 25,
    hasEvaluasiAtasan: false,
    items: [
      {
        no: 1,
        label: "Sikap -",
        description: "Dalam memberikan tugas kerja, menghadapi kesulitan kerja dan konflik kerja, pekerja memiliki kemampuan untuk mempertahankan ketenangan di bawah tekanan.",
        indicators: [
          { score: 1, label: "Nilai 1", text: "Tidak mampu menghadapi kesulitan kerja dan konflik kerja, dan memberikan tugas kerja dengan tenang di bawah tekanan" },
          { score: 2, label: "Nilai 2", text: "Mampu menghadapi kesulitan kerja dan konflik kerja, dan memberikan tugas kerja dengan tenang di bawah tekanan, namun masih membutuhkan arahan dari atasan" },
          { score: 3, label: "Nilai 3", text: "Mampu menghadapi kesulitan kerja dan konflik kerja, dan memberikan tugas kerja dengan tenang di bawah tekanan" },
          { score: 4, label: "Nilai 4", text: "Mampu menghadapi kesulitan kerja dan konflik kerja, dan memberikan tugas kerja dengan tenang, baik dan adil kepada rekan kerja/bawahan bahkan ketika berada di bawah tekanan" },
          { score: 5, label: "Nilai 5", text: "Mampu menghadapi kesulitan kerja dan konflik kerja dalam berbagai situasi dan kondisi baik itu konflik kerja diri sendiri ataupun konflik kerja orang lain, dan memberikan tugas kerja dengan tenang, baik dan adil kepada rekan kerja/bawahan bahkan ketika berada di bawah tekanan" },
        ],
      },
      {
        no: 2,
        label: "Inisiatif -",
        description: "Kemampuan untuk menilai dan memulai sesuatu secara mandiri dengan sumber daya dan kemampuan dalam menyelesaikan sesuatu.",
        indicators: [
          { score: 1, label: "Nilai 1", text: "Tidak mampu untuk menilai, memulai dan menyelesaikan sesuatu secara mandiri dengan sumber daya yang ada" },
          { score: 2, label: "Nilai 2", text: "Mampu untuk menilai dan memulai sesuatu secara mandiri, namun tidak mampu menyelesaikan sesuatu berdasarkan sumber daya yang ada" },
          { score: 3, label: "Nilai 3", text: "Mampu untuk menilai, memulai dan menyelesaikan sesuatu secara mandiri dengan sumber daya yang ada" },
          { score: 4, label: "Nilai 4", text: "Mampu untuk menilai, memulai dan menyelesaikan sesuatu secara mandiri dan menentukan sumber daya apa saja yang dibutuhkan baik sumber daya yang telah ada maupun yang belum ada" },
          { score: 5, label: "Nilai 5", text: "Mampu untuk menilai, memulai dan menyelesaikan sesuatu secara mandiri dan menyediakan seluruh sumber daya yang dibutuhkan, namun belum tersedia" },
        ],
      },
      {
        no: 3,
        label: "Kemampuan Interpersonal -",
        description: "Mampu mengekspresikan ide dan informasi kepada audiens yang ditargetkan, baik secara tertulis maupun lisan dengan cara yang lengkap, ringkas, terorganisir, jelas, tepat dan dengan kebijaksanaan. Menanggapi saran, instruksi, dan kritik secara positif.",
        indicators: [
          { score: 1, label: "Nilai 1", text: "Tidak mampu mengekspresikan ide dan informasi kepada audiens yang ditargetkan, baik secara tertulis maupun lisan dengan cara yang lengkap, ringkas, terorganisir, jelas, tepat dan dengan kebijaksanaan, serta menanggapi saran, instruksi, dan kritik secara positif" },
          { score: 2, label: "Nilai 2", text: "Mampu mengekspresikan ide dan informasi kepada audiens yang ditargetkan, baik secara tertulis dengan cara yang lengkap, ringkas, terorganisir, jelas, tepat dan dengan kebijaksanaan, serta menanggapi saran, instruksi, dan kritik secara positif, namun masih membutuhkan banyak pengembangan untuk mengekspresikannya secara lisan dengan baik" },
          { score: 3, label: "Nilai 3", text: "Mampu mengekspresikan ide dan informasi kepada audiens yang ditargetkan, baik secara tertulis maupun lisan dengan cara yang lengkap, ringkas, terorganisir, jelas, tepat dan dengan kebijaksanaan, serta menanggapi saran, instruksi, dan kritik secara positif" },
          { score: 4, label: "Nilai 4", text: "Mampu mengekspresikan ide dan informasi kepada audiens baik itu rekan kerja ataupun atasan yang ditargetkan baik secara tertulis maupun lisan dengan cara yang lengkap, ringkas, terorganisir, jelas, tepat dan dengan kebijaksanaan, serta menanggapi saran, instruksi, dan kritik secara positif dan konstruktif sesuai dengan situasi dan kondisi perusahaan yang dihadapi" },
          { score: 5, label: "Nilai 5", text: "Mampu mengekspresikan ide dan informasi kepada audiens baik itu rekan kerja ataupun atasan yang ditargetkan baik secara tertulis maupun lisan dengan cara yang lengkap, ringkas, terorganisir, jelas, tepat dan dengan kebijaksanaan, serta menanggapi saran, instruksi, dan kritik secara positif dan konstruktif untuk menciptakan perilaku-perilaku baru yang baik bagi rekan kerja ataupun atasan" },
        ],
      },
      {
        no: 4,
        label: "Mampu Bekerja dalam Tim -",
        description: "Secara aktif mencari dan menciptakan partisipasi kelompok untuk meningkatkan pekerjaan, menetapkan prioritas, inovasi dan kemampuan untuk menyelesaikan masalah secara konstruktif.",
        indicators: [
          { score: 1, label: "Nilai 1", text: "Tidak aktif mencari dan menciptakan partisipasi kelompok untuk meningkatkan pekerjaan, menetapkan prioritas, inovasi dan mampu untuk menyelesaikan masalah secara konstruktif" },
          { score: 2, label: "Nilai 2", text: "Aktif mencari dan menciptakan partisipasi kelompok untuk meningkatkan pekerjaan, menetapkan prioritas, inovasi, namun membutuhkan arahan dan bimbingan untuk mengembangkan kemampuan dalam menyelesaikan masalah secara konstruktif" },
          { score: 3, label: "Nilai 3", text: "Aktif mencari dan menciptakan partisipasi kelompok untuk meningkatkan pekerjaan, menetapkan prioritas, inovasi dan mampu untuk menyelesaikan masalah secara konstruktif" },
          { score: 4, label: "Nilai 4", text: "Aktif mencari, menciptakan dan mendorong rekan kerja berpartisipasi dalam kelompok untuk meningkatkan pekerjaan, menetapkan prioritas, inovasi dan mampu untuk menyelesaikan masalah secara konstruktif yang dapat diterapkan sesuai dengan situasi dan kondisi perusahaan" },
          { score: 5, label: "Nilai 5", text: "Aktif mencari, menciptakan dan mendorong rekan kerja berpartisipasi dalam kelompok untuk meningkatkan pekerjaan, menetapkan prioritas, inovasi dan mampu untuk menyelesaikan masalah baik itu masalah pribadi maupun rekan kerja secara konstruktif yang dapat diterapkan sesuai dengan situasi dan kondisi perusahaan" },
        ],
      },
      {
        no: 5,
        label: "Peningkatan Keterampilan secara Berkelanjutan -",
        description: "Menunjukkan minat untuk tidak hanya mempertahankan keterampilan saat ini tetapi juga terus meningkatkan untuk memenuhi tantangan persyaratan pekerjaan dan menggunakan inisiatif untuk mencari tahu apa yang kurang.",
        indicators: [
          { score: 1, label: "Nilai 1", text: "Tidak menunjukkan minat untuk mempertahankan dan meningkatkan keterampilan saat ini untuk memenuhi tantangan persyaratan pekerjaan dan menggunakan inisiatif untuk mencari tahu apa yang kurang" },
          { score: 2, label: "Nilai 2", text: "Menunjukkan minat untuk mempertahankan, namun belum memiliki minat untuk meningkatkan keterampilan saat ini untuk memenuhi tantangan persyaratan pekerjaan dan menggunakan inisiatif untuk mencari tahu apa yang kurang" },
          { score: 3, label: "Nilai 3", text: "Menunjukkan minat untuk mempertahankan dan meningkatkan keterampilan saat ini untuk memenuhi tantangan persyaratan pekerjaan dan menggunakan inisiatif untuk mencari tahu apa yang kurang" },
          { score: 4, label: "Nilai 4", text: "Menunjukkan minat untuk mempertahankan dan meningkatkan keterampilannya dalam pekerjaan dan/atau di luar pekerjaan saat ini untuk memenuhi tantangan persyaratan pekerjaan dan menggunakan inisiatif untuk mencari tahu bagian yang perlu diperbaiki dan yang dapat ditingkatkan" },
          { score: 5, label: "Nilai 5", text: "Menunjukkan minat dan mendorong rekan kerja untuk menunjukkan minat yang sama untuk mempertahankan dan meningkatkan keterampilannya dalam pekerjaan dan/atau di luar pekerjaan saat ini untuk memenuhi tantangan persyaratan pekerjaan dan menggunakan inisiatif untuk mencari tahu bagian yang perlu diperbaiki dan yang dapat ditingkatkan" },
        ],
      },
    ],
  },

  // ── FORM C ─────────────────────────────────────────────────────────────────
  {
    id: "C",
    tab: "Form C",
    subtitle: "Keterampilan Relasi Interpersonal",
    title: "Form C",
    sectionTitle: "BAGIAN C - KETERAMPILAN RELASI INTERPERSONAL",
    percentage: 15,
    hasEvaluasiAtasan: false,
    items: [
      {
        no: 1,
        label: "",
        description: "Mampu menjaga hubungan baik dengan rekan kerja dalam satu departemen maupun luar departemen.",
        indicators: [
          { score: 1, label: "Nilai 1", text: "Tidak mampu menjaga hubungan baik dengan rekan kerja dalam satu departemen maupun luar departemen" },
          { score: 2, label: "Nilai 2", text: "Mampu menjaga hubungan baik dengan rekan kerja dalam satu departemen, namun masih perlu bimbingan dan contoh dari atasan untuk menjaga hubungan baik dengan rekan kerja di luar departemen" },
          { score: 3, label: "Nilai 3", text: "Mampu menjaga hubungan baik dengan rekan kerja dalam satu departemen maupun luar departemen" },
          { score: 4, label: "Nilai 4", text: "Mampu menjaga hubungan baik dengan rekan kerja dalam satu departemen maupun luar departemen dan mendorong rekan kerja satu departemen untuk menjaga hubungan baik juga" },
          { score: 5, label: "Nilai 5", text: "Mampu menjaga hubungan baik dengan rekan kerja dalam satu departemen maupun luar departemen dan memberikan contoh dan cara yang baik bagi rekan kerja satu departemennya dalam menjaga hubungan baik" },
        ],
      },
      {
        no: 2,
        label: "",
        description: "Mampu menjalin interaksi dengan orang-orang dari berbagai tingkat jabatan (termasuk dengan kolega dari perusahaan lain yang masih ada dalam satu grup).",
        indicators: [
          { score: 1, label: "Nilai 1", text: "Tidak mampu menjalin interaksi dengan orang-orang dari berbagai tingkat jabatan (termasuk dengan kolega dari perusahaan lain yang masih ada dalam satu grup)" },
          { score: 2, label: "Nilai 2", text: "Mampu menjalin interaksi dengan orang-orang dari berbagai tingkat jabatan, namun masih membutuhkan arahan untuk menjalin interaksi dengan kolega dari perusahaan lain yang masih ada dalam satu grup" },
          { score: 3, label: "Nilai 3", text: "Mampu menjalin interaksi dengan orang-orang dari berbagai tingkat jabatan (termasuk dengan kolega dari perusahaan lain yang masih ada dalam satu grup)" },
          { score: 4, label: "Nilai 4", text: "Mampu menjalin interaksi positif dan koordinasi yang baik dengan orang-orang dari berbagai tingkat jabatan (termasuk dengan kolega dari perusahaan lain yang masih ada dalam satu grup)" },
          { score: 5, label: "Nilai 5", text: "Mampu menjadi orang pertama yang memulai dan menjalin interaksi positif dan koordinasi yang baik dengan orang-orang dari berbagai tingkat jabatan (termasuk dengan kolega dari perusahaan lain yang masih ada dalam satu grup)" },
        ],
      },
      {
        no: 3,
        label: "",
        description: "Mampu menjaga kekompakan di tempat kerja dan menunjukkan rasa hormat pada rekan kerja.",
        indicators: [
          { score: 1, label: "Nilai 1", text: "Tidak mampu menjaga kekompakan di tempat kerja dan menunjukkan rasa hormat pada rekan kerja" },
          { score: 2, label: "Nilai 2", text: "Membutuhkan arahan dan bimbingan dari atasan agar mampu menjaga kekompakan di tempat kerja dan menunjukkan rasa hormat pada rekan kerja" },
          { score: 3, label: "Nilai 3", text: "Mampu menjaga kekompakan di tempat kerja dan menunjukkan rasa hormat pada rekan kerja" },
          { score: 4, label: "Nilai 4", text: "Mampu menjaga kekompakan di tempat kerja dan menunjukkan rasa hormat pada rekan kerja satu departemen dan di luar departemen" },
          { score: 5, label: "Nilai 5", text: "Mampu menjaga, mendorong dan menciptakan kekompakan di tempat kerja dan menunjukkan rasa hormat pada rekan kerja satu departemen dan di luar departemen" },
        ],
      },
    ],
  },
];

const MASTER_FORMS_KEY = "master_appraisal_forms_v1";

export function loadMasterAppraisalForms(): FormDef[] {
  const stored = loadPersistedState<FormDef[] | null>(MASTER_FORMS_KEY, null);
  if (Array.isArray(stored) && stored.length === 3) {
    return stored;
  }
  return FORMS;
}

export function saveMasterAppraisalForms(forms: FormDef[]): void {
  savePersistedState(MASTER_FORMS_KEY, forms, {
    kind: "master-catalog",
    catalogKey: MASTER_FORMS_KEY,
    data: forms,
    audit: {
      action: "Update",
      module: "HR Settings",
      subModule: "Master Appraisal Form",
      description: "Updated Master Appraisal Form criteria & indicators",
    },
  });
}

// ─── Indicator Modal ──────────────────────────────────────────────────────────

function IndicatorModal({ item, onClose }: { item: FormItem; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Indikator Penilaian</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Table */}
        <div className="overflow-auto flex-1">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0">
              <tr>
                <th className="bg-[#1A284F] text-white text-left py-3 px-4 font-semibold w-56 border-r border-white/20">
                  Indikator Penilaian
                </th>
                {[1, 2, 3, 4, 5].map((n) => (
                  <th key={n} className="bg-[#1A284F] text-white text-center py-3 px-4 font-semibold border-r border-white/20 last:border-r-0">
                    {n}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {/* Label column */}
                <td className="py-4 px-4 align-top border-r border-gray-200 bg-gray-50">
                  <p className="font-semibold text-gray-800 mb-1">{item.label || "Indikator"}</p>
                  <p className="text-xs text-gray-500 leading-relaxed">{item.description}</p>
                </td>
                {/* Score columns */}
                {item.indicators.map((ind) => (
                  <td key={ind.score} className="py-4 px-4 align-top text-gray-700 leading-relaxed border-r border-gray-100 last:border-r-0 text-xs">
                    {ind.text}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        <div className="px-6 py-3 border-t border-gray-100 shrink-0 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-[#1A284F] text-white rounded text-sm font-medium hover:bg-[#131d3b] transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type Ratings = Record<string, number | null>;
type SavedForms = Record<string, { total: number }>;

function key(formId: string, no: number) {
  return `${formId}-${no}`;
}

// ─── Confirm Submit Modal ─────────────────────────────────────────────────────

function ConfirmModal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 relative">
        <button onClick={onCancel} className="absolute top-4 right-4 w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-100 transition-colors">
          <X className="w-4 h-4 text-gray-500" />
        </button>
        <h3 className="text-base font-bold text-gray-900 mb-5">Action Confirmation</h3>
        <p className="text-sm text-gray-700 mb-6">Are you sure you want to submit this appraisal form?</p>
        <div className="flex items-center gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-full border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-full bg-[#1A284F] text-white text-sm font-semibold hover:bg-[#131d3b] transition-colors"
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Success Modal ────────────────────────────────────────────────────────────

function SuccessModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-100 transition-colors">
          <X className="w-4 h-4 text-gray-500" />
        </button>
        <h3 className="text-base font-bold text-gray-900 mb-8">Action Confirmation</h3>
        <div className="flex flex-col items-center gap-4 mb-8">
          <div className="relative">
            <FileCheck className="w-14 h-14 text-[#C69A45]" />
            <CheckCircle2 className="w-5 h-5 text-[#C69A45] absolute -bottom-1 -right-1 bg-white rounded-full" />
          </div>
          <p className="text-sm text-gray-700 text-center">Performance Appraisal Form successfully submitted for approval</p>
        </div>
      </div>
    </div>
  );
}

export function AppraisalForm() {
  const [formsList, setFormsList] = useState<FormDef[]>(() => loadMasterAppraisalForms());
  const [activeForm, setActiveForm] = useState<"A" | "B" | "C">("A");
  const [selfRatings, setSelfRatings] = useState<Ratings>(() => {
    const existing = loadAppraisalSelf();
    if (!existing) return {};
    const merged: Ratings = {};
    existing.forms.forEach((f) => {
      Object.entries(f.ratings).forEach(([k, v]) => {
        merged[k] = v;
      });
    });
    return merged;
  });
  const [savedForms, setSavedForms] = useState<SavedForms>(() => {
    const existing = loadAppraisalSelf();
    if (!existing) return {};
    const saved: SavedForms = {};
    existing.forms.forEach((f) => {
      if (Object.keys(f.ratings).length > 0) {
        saved[f.formId] = { total: f.avgScore };
      }
    });
    return saved;
  });
  const [modalItem, setModalItem] = useState<FormItem | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    const onHydrated = () => setFormsList(loadMasterAppraisalForms());
    window.addEventListener("pa-db-hydrated", onHydrated);
    return () => window.removeEventListener("pa-db-hydrated", onHydrated);
  }, []);

  const form = formsList.find((f) => f.id === activeForm) ?? formsList[0];

  const sumScore = form.items.reduce((sum, item) => {
    return sum + (selfRatings[key(form.id, item.no)] ?? 0);
  }, 0);

  const rated = form.items.filter((item) => selfRatings[key(form.id, item.no)] != null).length;
  const avgScore = rated > 0 ? sumScore / rated : 0;
  const isSaved = !!savedForms[activeForm];
  const allRated = rated === form.items.length;
  const allFormsSaved = ["A", "B", "C"].every((id) => !!savedForms[id]);

  const handleConfirmSubmit = () => {
    setShowConfirm(false);
    setShowSuccess(true);
  };

  const setRating = (no: number, val: number) => {
    // Unsave if editing after save
    if (savedForms[activeForm]) {
      setSavedForms((prev) => { const n = { ...prev }; delete n[activeForm]; return n; });
    }
    setSelfRatings((prev) => ({ ...prev, [key(form.id, no)]: val }));
  };

  const saveForm = () => {
    const nextSavedForms = { ...savedForms, [activeForm]: { total: avgScore } };
    setSavedForms(nextSavedForms);

    // Build all saved form entries for persistence
    const allFormEntries = formsList.map((f) => {
      const fRatings: Record<string, number> = {};
      f.items.forEach((item) => {
        const v = selfRatings[key(f.id, item.no)];
        if (v != null) fRatings[key(f.id, item.no)] = v as number;
      });
      const saved = nextSavedForms[f.id];
      return { formId: f.id, ratings: fRatings, avgScore: saved?.total ?? 0 };
    });

    const isSupervisor = window.location.pathname.includes("/supervisor");
    if (isSupervisor) {
      const existing = loadAllAppraisalApprovers();
      const existing1 = existing.find((e) => e.approverLevel === 1);
      saveAppraisalApprover({
        approverName: existing1?.approverName ?? "Budi Santoso",
        approverRole: existing1?.approverRole ?? "Atasan Langsung",
        approverLevel: 1,
        forms: allFormEntries,
        overallComment: existing1?.overallComment ?? "",
        reviewedDate: new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" }),
      });
    } else {
      saveAppraisalSelf({
        forms: allFormEntries,
        submittedAt: new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" }),
      });
    }

    const nextIndex = formsList.findIndex((f) => f.id === activeForm) + 1;
    if (nextIndex < formsList.length) {
      setActiveForm(formsList[nextIndex].id);
    }
  };

  const resetForm = () => {
    const updated = { ...selfRatings };
    form.items.forEach((item) => delete updated[key(form.id, item.no)]);
    setSelfRatings(updated);
    setSavedForms((prev) => { const n = { ...prev }; delete n[activeForm]; return n; });
  };

  return (
    <div className="w-full flex flex-col h-full pb-20 relative">
      {/* Tab bar */}
      <div className="flex border-b border-gray-200 mb-5 shrink-0">
        {formsList.map((f, idx) => {
          const isTabSaved = !!savedForms[f.id];
          const isActive = activeForm === f.id;
          // Locked if any previous form is not yet saved
          const isLocked = idx > 0 && !savedForms[formsList[idx - 1].id];
          return (
            <button
              key={f.id}
              onClick={() => !isLocked && setActiveForm(f.id)}
              disabled={isLocked}
              title={isLocked ? `Complete ${formsList[idx - 1].tab} first` : undefined}
              className={`flex-1 text-center py-4 px-4 transition-colors border-b-2 ${
                isActive
                  ? "border-[#1A284F] bg-gray-50"
                  : isLocked
                  ? "border-transparent opacity-40 cursor-not-allowed"
                  : "border-transparent hover:bg-gray-50 cursor-pointer"
              }`}
            >
              <div className="flex items-center justify-center gap-1.5 mb-0.5">
                <p className={`text-sm ${isActive ? "font-bold text-gray-900" : "font-medium text-gray-500"}`}>
                  {f.tab}
                </p>
                {isTabSaved && (
                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                )}
              </div>
              <p className={`text-xs ${isActive ? "text-[#1A284F]" : "text-gray-400"}`}>
                {f.subtitle}
              </p>
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col gap-4">
        {/* Form header */}
        <div className="bg-white border border-gray-100 rounded-xl py-5 text-center shadow-sm shrink-0">
          <p className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-1">Performance Appraisal</p>
          <h2 className="text-2xl font-bold text-gray-900 mb-1">{form.title}</h2>
          <p className="text-sm text-[#1A284F]">Indikator Penilaian {form.subtitle}</p>
        </div>

        {/* Section header */}
        <div className="flex items-center justify-between bg-[#1A284F] text-white px-5 py-3 rounded-lg shrink-0">
          <span className="text-sm font-bold tracking-wide">{form.sectionTitle}</span>
          <span className="text-xs font-semibold bg-[#C69A45] text-white px-3 py-1 rounded whitespace-nowrap">
            ({form.percentage}%) Nilai Total
          </span>
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden shrink-0">
          {/* Table head */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="py-3 px-4 text-left font-semibold text-gray-700 border-r border-gray-200 w-12">No</th>
                  <th className="py-3 px-4 text-left font-semibold text-gray-700 border-r border-gray-200">{form.sectionTitle.replace("BAGIAN", "Bagian")}</th>
                  <th className="py-3 px-4 text-center font-semibold text-gray-700 border-r border-gray-200 w-44">Indikator Penilaian</th>
                  <th className="py-3 px-4 text-center font-semibold text-gray-700 w-56" colSpan={form.hasEvaluasiAtasan ? 1 : 1}>
                    <div>Evaluasi Pribadi Karyawan</div>
                    <div className="flex justify-around mt-1 text-gray-400 font-normal">
                      {[1,2,3,4,5].map(n => <span key={n} className="w-8 text-center">{n}</span>)}
                    </div>
                  </th>
                  {form.hasEvaluasiAtasan && (
                    <th className="py-3 px-4 text-center font-semibold text-gray-700 w-56 border-l border-gray-200">
                      <div>Evaluasi Atasan</div>
                      <div className="flex justify-around mt-1 text-gray-400 font-normal">
                        {[1,2,3,4,5].map(n => <span key={n} className="w-8 text-center">{n}</span>)}
                      </div>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {form.items.map((item) => {
                  const selected = selfRatings[key(form.id, item.no)] ?? null;
                  return (
                    <tr key={item.no} className="hover:bg-gray-50/50 transition-colors">
                      {/* No */}
                      <td className="py-4 px-4 text-gray-500 align-top border-r border-gray-100">{item.no}</td>

                      {/* Description */}
                      <td className="py-4 px-4 align-top border-r border-gray-100 leading-relaxed text-gray-800">
                        {item.label && (
                          <span className="font-bold italic">{item.label} </span>
                        )}
                        {item.description}
                      </td>

                      {/* Indicator button */}
                      <td className="py-4 px-4 align-middle border-r border-gray-100 text-center">
                        <button
                          onClick={() => setModalItem(item)}
                          className="text-xs font-medium px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 hover:border-[#1A284F] hover:text-[#1A284F] transition-colors text-gray-700 whitespace-nowrap"
                        >
                          Lihat Indikator Penilaian
                        </button>
                      </td>

                      {/* Self rating 1–5 */}
                      <td className="py-4 px-4 align-middle">
                        <div className="flex items-center justify-around">
                          {[1,2,3,4,5].map((n) => (
                            <button
                              key={n}
                              onClick={() => setRating(item.no, n)}
                              className={`w-8 h-8 rounded border text-xs font-semibold transition-colors ${
                                selected === n
                                  ? "bg-[#1A284F] text-white border-[#1A284F]"
                                  : "border-gray-300 text-gray-600 hover:border-[#1A284F] hover:text-[#1A284F]"
                              }`}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                      </td>

                      {/* Atasan rating (disabled for employee) */}
                      {form.hasEvaluasiAtasan && (
                        <td className="py-4 px-4 align-middle border-l border-gray-100">
                          <div className="flex items-center justify-around">
                            {[1,2,3,4,5].map((n) => (
                              <div
                                key={n}
                                className="w-8 h-8 rounded border border-gray-200 text-xs font-semibold text-gray-300 flex items-center justify-center bg-gray-50 cursor-not-allowed"
                              >
                                {n}
                              </div>
                            ))}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}

                {/* Total row */}
                <tr className="bg-gray-50 border-t border-gray-200">
                  <td colSpan={form.hasEvaluasiAtasan ? 3 : 3} className="py-3 px-4 text-sm font-bold text-gray-800 border-r border-gray-200 text-right">
                    ({form.percentage}%) Nilai Total
                  </td>
                  <td className="py-3 px-4 text-center font-bold text-[#1A284F]">
                    {avgScore > 0 ? avgScore.toFixed(2) : "—"}
                  </td>
                  {form.hasEvaluasiAtasan && (
                    <td className="py-3 px-4 text-center font-bold text-gray-300 border-l border-gray-100">
                      0
                    </td>
                  )}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Sticky bottom bar */}
      <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-3 flex items-center justify-between z-10 gap-4">
        {isSaved ? (
          <>
            <div className="flex-1 flex items-center gap-2 bg-green-50 border border-green-200 rounded px-4 py-2.5">
              <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
              <p className="text-sm font-medium text-green-800">
                Form berhasil disimpan. Nilai Rata-rata: <span className="font-bold">{savedForms[activeForm]?.total.toFixed(2)}</span>
              </p>
            </div>
            <button
              onClick={resetForm}
              className="px-5 py-2 border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shrink-0"
            >
              Reset
            </button>
            {activeForm === "C" && (
              <button
                onClick={() => setShowConfirm(true)}
                disabled={!allFormsSaved}
                className="px-6 py-2 bg-[#C69A45] text-white rounded text-sm font-semibold hover:bg-[#b38a3a] transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                Submit Form
              </button>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-gray-500">
              <span className="font-semibold text-gray-800">{rated}</span> dari{" "}
              <span className="font-semibold text-gray-800">{form.items.length}</span> kompetensi telah dinilai
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={resetForm}
                className="px-5 py-2 border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Reset
              </button>
              <button
                onClick={saveForm}
                disabled={!allRated}
                className="px-5 py-2 bg-[#1A284F] text-white rounded text-sm font-medium hover:bg-[#131d3b] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Save
              </button>
              {activeForm === "C" && (
                <button
                  disabled
                  className="px-6 py-2 bg-[#C69A45] text-white rounded text-sm font-semibold opacity-40 cursor-not-allowed shrink-0"
                >
                  Submit Form
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Indicator modal */}
      {modalItem && (
        <IndicatorModal item={modalItem} onClose={() => setModalItem(null)} />
      )}

      {/* Confirm submit modal */}
      {showConfirm && (
        <ConfirmModal onCancel={() => setShowConfirm(false)} onConfirm={handleConfirmSubmit} />
      )}

      {/* Success modal */}
      {showSuccess && (
        <SuccessModal onClose={() => setShowSuccess(false)} />
      )}
    </div>
  );
}
