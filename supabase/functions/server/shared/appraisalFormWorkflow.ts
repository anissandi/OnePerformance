import { simulationAssignments, simulationEmployees, simulationUnits } from "./paSimulation2026.ts";
import { WorkflowError } from "./kpiSettingWorkflow.ts";
import type { KpiAction, KpiDocument, KpiStage, KpiWindow } from "./kpiSettingWorkflow.ts";
import { assertWindowOpen } from "./smartGoalsWorkflow.ts";

export type AppraisalFormId = "A" | "B" | "C";
export type AppraisalScoreValue = 1 | 2 | 3 | 4 | 5;

export type AppraisalIndicator = {
  score: AppraisalScoreValue;
  label: string;
  text: string;
};

export type AppraisalFormItemDef = {
  no: number;
  label: string;
  description: string;
  indicators: AppraisalIndicator[];
};

export type AppraisalFormSectionDef = {
  id: AppraisalFormId;
  tab: string;
  subtitle: string;
  title: string;
  sectionTitle: string;
  percentage: number;
  items: AppraisalFormItemDef[];
};

export const APPRAISAL_FORM_DEFS: AppraisalFormSectionDef[] = [
  {
    id: "A",
    tab: "Form A",
    subtitle: "Kompetensi Kerja & Keterampilan Fungsional",
    title: "Form A",
    sectionTitle: "BAGIAN A - KOMPETENSI KERJA & KETERAMPILAN FUNGSIONAL",
    percentage: 60,
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
        description: "Mampu menimbang dan mengevaluasi informasi secara realistis, mengidentifikasi tingkat kepentingan, menilai berbagai konsekuensi yang mungkin terjadi dan mengambil tindakan yang sesuai.",
        indicators: [
          { score: 1, label: "Nilai 1", text: "Tidak mampu menimbang dan mengevaluasi informasi secara realistis, mengidentifikasi kepentingan, menilai konsekuensi dan mengambil keputusan yang tepat dan cepat" },
          { score: 2, label: "Nilai 2", text: "Mampu menimbang dan mengevaluasi informasi secara realistis, mengidentifikasi kepentingan, menilai konsekuensi, namun membutuhkan waktu yang lebih lama untuk membuat keputusan yang tepat" },
          { score: 3, label: "Nilai 3", text: "Mampu menimbang dan mengevaluasi informasi secara realistis, mengidentifikasi kepentingan, menilai konsekuensi dan membuat keputusan yang tepat untuk tujuan departemen/perusahaan" },
          { score: 4, label: "Nilai 4", text: "Mampu menimbang dan mengevaluasi informasi secara realistis, mengidentifikasi kepentingan, dan membuat keputusan yang tepat serta bertanggung jawab atas konsekuensi" },
          { score: 5, label: "Nilai 5", text: "Mampu mencari dan mengevaluasi informasi secara realistis, mengidentifikasi kepentingan dan mengambil keputusan secara cepat dan tepat sesuai dengan tujuan departemen/perusahaan" },
        ],
      },
      {
        no: 8,
        label: "Tanggung Jawab:",
        description: "Dapat dipercaya untuk bekerja, terkadang tanpa adanya pengawasan ketat, dan tetap bertanggung jawab terhadap pekerjaan yang harus diselesaikan.",
        indicators: [
          { score: 1, label: "Nilai 1", text: "Tidak dapat dipercaya ketika bekerja tanpa adanya pengawasan ketat" },
          { score: 2, label: "Nilai 2", text: "Dapat dipercaya untuk bekerja tanpa adanya pengawasan ketat namun harus dilakukan pengembangan untuk selalu bertanggung jawab menyelesaikan pekerjaan" },
          { score: 3, label: "Nilai 3", text: "Dapat dipercaya untuk bekerja tanpa adanya pengawasan ketat, dan bertanggung jawab terhadap pekerjaan yang harus diselesaikan" },
          { score: 4, label: "Nilai 4", text: "Dapat dipercaya untuk bekerja tanpa adanya pengawasan dari atasan, selalu melaporkan progress pekerjaan kepada atasan" },
          { score: 5, label: "Nilai 5", text: "Dapat dipercaya untuk bekerja menyelesaikan pekerjaan sendiri dan membantu pekerjaan rekan kerja tanpa adanya pengawasan dari atasan" },
        ],
      },
      {
        no: 9,
        label: "Sikap terhadap Perubahan dan Peningkatan:",
        description: "Mengukur efektivitas dalam perubahan yang dimulai, beradaptasi terhadap perubahan-perubahan penting dari penggunaan metode lama ke baru ketika metode lama sudah tidak relevan.",
        indicators: [
          { score: 1, label: "Nilai 1", text: "Tidak mampu beradaptasi terhadap perubahan penting dari penggunaan metode lama yang sudah tidak relevan menjadi metode baru" },
          { score: 2, label: "Nilai 2", text: "Mampu beradaptasi terhadap perubahan penting dari penggunaan metode lama menjadi metode baru, namun belum dapat menghasilkan peningkatan kerja" },
          { score: 3, label: "Nilai 3", text: "Mampu beradaptasi terhadap perubahan penting dari penggunaan metode lama menjadi metode baru dan menghasilkan peningkatan kerja" },
          { score: 4, label: "Nilai 4", text: "Mampu beradaptasi terhadap perubahan penting, mengidentifikasi metode-metode baru dan menghasilkan peningkatan kerja" },
          { score: 5, label: "Nilai 5", text: "Mampu beradaptasi terhadap perubahan penting, mengidentifikasi metode baru, mengajarkan penggunaan metode baru kepada orang lain dan menghasilkan peningkatan kerja" },
        ],
      },
      {
        no: 10,
        label: "Mempelajari dan Menggunakan Keterampilan Baru:",
        description: "Menunjukkan kemampuan untuk menangkap informasi/keterampilan baru dalam jangka waktu yang masuk akal dan dapat menerapkannya di waktu yang tepat.",
        indicators: [
          { score: 1, label: "Nilai 1", text: "Tidak mampu menangkap informasi/keterampilan baru dalam jangka waktu yang masuk akal" },
          { score: 2, label: "Nilai 2", text: "Mampu menangkap informasi/keterampilan baru dalam jangka waktu yang masuk akal, namun belum dapat menerapkannya di waktu yang tepat" },
          { score: 3, label: "Nilai 3", text: "Mampu menangkap informasi/keterampilan baru dalam jangka waktu yang masuk akal dan dapat menerapkannya di waktu yang tepat" },
          { score: 4, label: "Nilai 4", text: "Mampu menangkap informasi/keterampilan baru dalam jangka waktu cepat dibandingkan dengan orang lain dan dapat menerapkannya di waktu yang tepat" },
          { score: 5, label: "Nilai 5", text: "Mampu menangkap informasi/keterampilan baru dalam jangka waktu cepat dan dapat langsung menerapkannya di waktu dan kondisi yang tepat" },
        ],
      },
      {
        no: 11,
        label: "Partisipasi:",
        description: "Menunjukkan keikutsertaan, ketertarikan, keterlibatan, dan kontribusi dalam diskusi terkait produk, pekerjaan, dan sebagainya, serta menghasilkan berbagai ide kreatif dan solusi.",
        indicators: [
          { score: 1, label: "Nilai 1", text: "Tidak menunjukkan keikutsertaan, ketertarikan, keterlibatan dan kontribusi dalam diskusi terkait produk dan pekerjaan" },
          { score: 2, label: "Nilai 2", text: "Mampu menunjukkan keikutsertaan, ketertarikan, keterlibatan dan kontribusi dalam diskusi, namun belum dapat menghasilkan ide kreatif dan solusi" },
          { score: 3, label: "Nilai 3", text: "Mampu menunjukkan keikutsertaan, ketertarikan, keterlibatan dan kontribusi dalam diskusi serta menghasilkan ide kreatif dan solusi" },
          { score: 4, label: "Nilai 4", text: "Mampu menunjukkan keikutsertaan, ketertarikan, keterlibatan dan kontribusi dalam diskusi serta menghasilkan ide kreatif yang dapat diterapkan sesuai kondisi perusahaan" },
          { score: 5, label: "Nilai 5", text: "Mampu menunjukkan keikutsertaan, ketertarikan, keterlibatan dan kontribusi dalam diskusi serta dapat langsung menerapkan ide kreatif tersebut di dalam perusahaan" },
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
  {
    id: "B",
    tab: "Form B",
    subtitle: "Kepribadian",
    title: "Form B",
    sectionTitle: "BAGIAN B - KEPRIBADIAN",
    percentage: 25,
    items: [
      {
        no: 1,
        label: "Sikap -",
        description: "Dalam memberikan tugas kerja, menghadapi kesulitan kerja dan konflik kerja, pekerja memiliki kemampuan untuk mempertahankan ketenangan di bawah tekanan.",
        indicators: [
          { score: 1, label: "Nilai 1", text: "Tidak mampu menghadapi kesulitan kerja dan konflik kerja, dan memberikan tugas kerja dengan tenang di bawah tekanan" },
          { score: 2, label: "Nilai 2", text: "Mampu menghadapi kesulitan kerja dan konflik kerja dengan tenang di bawah tekanan, namun masih membutuhkan arahan dari atasan" },
          { score: 3, label: "Nilai 3", text: "Mampu menghadapi kesulitan kerja dan konflik kerja, dan memberikan tugas kerja dengan tenang di bawah tekanan" },
          { score: 4, label: "Nilai 4", text: "Mampu menghadapi kesulitan kerja dan konflik kerja, dan memberikan tugas kerja dengan tenang, baik dan adil kepada rekan kerja/bawahan bahkan ketika berada di bawah tekanan" },
          { score: 5, label: "Nilai 5", text: "Mampu menghadapi kesulitan kerja dan konflik kerja dalam berbagai situasi dan kondisi baik itu konflik kerja diri sendiri ataupun orang lain dengan tenang, baik dan adil" },
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
          { score: 4, label: "Nilai 4", text: "Mampu untuk menilai, memulai dan menyelesaikan sesuatu secara mandiri dan menentukan sumber daya apa saja yang dibutuhkan" },
          { score: 5, label: "Nilai 5", text: "Mampu untuk menilai, memulai dan menyelesaikan sesuatu secara mandiri dan menyediakan seluruh sumber daya yang dibutuhkan, namun belum tersedia" },
        ],
      },
      {
        no: 3,
        label: "Kemampuan Interpersonal -",
        description: "Mampu mengekspresikan ide dan informasi kepada audiens yang ditargetkan, baik secara tertulis maupun lisan dengan cara yang lengkap, ringkas, terorganisir, jelas, tepat dan dengan kebijaksanaan. Menanggapi saran, instruksi, dan kritik secara positif.",
        indicators: [
          { score: 1, label: "Nilai 1", text: "Tidak mampu mengekspresikan ide dan informasi kepada audiens yang ditargetkan, serta menanggapi saran, instruksi, dan kritik secara positif" },
          { score: 2, label: "Nilai 2", text: "Mampu mengekspresikan ide secara tertulis dengan baik, namun masih membutuhkan pengembangan untuk mengekspresikannya secara lisan" },
          { score: 3, label: "Nilai 3", text: "Mampu mengekspresikan ide dan informasi secara tertulis maupun lisan dengan jelas dan tepat, serta menanggapi saran dan kritik secara positif" },
          { score: 4, label: "Nilai 4", text: "Mampu mengekspresikan ide dan informasi kepada rekan kerja ataupun atasan secara tertulis maupun lisan serta menanggapi saran dan kritik secara positif dan konstruktif" },
          { score: 5, label: "Nilai 5", text: "Mampu mengekspresikan ide dan informasi dengan sangat baik serta menanggapi saran dan kritik secara konstruktif untuk menciptakan perilaku baru yang baik" },
        ],
      },
      {
        no: 4,
        label: "Mampu Bekerja dalam Tim -",
        description: "Secara aktif mencari dan menciptakan partisipasi kelompok untuk meningkatkan pekerjaan, menetapkan prioritas, inovasi dan kemampuan untuk menyelesaikan masalah secara konstruktif.",
        indicators: [
          { score: 1, label: "Nilai 1", text: "Tidak aktif mencari dan menciptakan partisipasi kelompok untuk meningkatkan pekerjaan dan menyelesaikan masalah secara konstruktif" },
          { score: 2, label: "Nilai 2", text: "Aktif mencari partisipasi kelompok, namun membutuhkan arahan dan bimbingan untuk menyelesaikan masalah secara konstruktif" },
          { score: 3, label: "Nilai 3", text: "Aktif mencari dan menciptakan partisipasi kelompok untuk meningkatkan pekerjaan, menetapkan prioritas, inovasi dan menyelesaikan masalah secara konstruktif" },
          { score: 4, label: "Nilai 4", text: "Aktif mencari, menciptakan dan mendorong rekan kerja berpartisipasi dalam kelompok untuk meningkatkan pekerjaan dan menyelesaikan masalah secara konstruktif" },
          { score: 5, label: "Nilai 5", text: "Aktif mendorong rekan kerja berpartisipasi dalam kelompok serta mampu menyelesaikan masalah pribadi maupun rekan kerja secara konstruktif" },
        ],
      },
      {
        no: 5,
        label: "Peningkatan Keterampilan secara Berkelanjutan -",
        description: "Menunjukkan minat untuk tidak hanya mempertahankan keterampilan saat ini tetapi juga terus meningkatkan untuk memenuhi tantangan persyaratan pekerjaan.",
        indicators: [
          { score: 1, label: "Nilai 1", text: "Tidak menunjukkan minat untuk mempertahankan dan meningkatkan keterampilan saat ini" },
          { score: 2, label: "Nilai 2", text: "Menunjukkan minat untuk mempertahankan, namun belum memiliki minat untuk meningkatkan keterampilan saat ini" },
          { score: 3, label: "Nilai 3", text: "Menunjukkan minat untuk mempertahankan dan meningkatkan keterampilan saat ini untuk memenuhi tantangan persyaratan pekerjaan" },
          { score: 4, label: "Nilai 4", text: "Menunjukkan minat untuk mempertahankan dan meningkatkan keterampilan dalam pekerjaan maupun di luar pekerjaan saat ini" },
          { score: 5, label: "Nilai 5", text: "Menunjukkan minat dan mendorong rekan kerja untuk mempertahankan dan meningkatkan keterampilannya secara berkelanjutan" },
        ],
      },
    ],
  },
  {
    id: "C",
    tab: "Form C",
    subtitle: "Keterampilan Relasi Interpersonal",
    title: "Form C",
    sectionTitle: "BAGIAN C - KETERAMPILAN RELASI INTERPERSONAL",
    percentage: 15,
    items: [
      {
        no: 1,
        label: "",
        description: "Mampu menjaga hubungan baik dengan rekan kerja dalam satu departemen maupun luar departemen.",
        indicators: [
          { score: 1, label: "Nilai 1", text: "Tidak mampu menjaga hubungan baik dengan rekan kerja dalam satu departemen maupun luar departemen" },
          { score: 2, label: "Nilai 2", text: "Mampu menjaga hubungan baik dalam satu departemen, namun masih perlu bimbingan untuk menjaga hubungan baik dengan rekan kerja di luar departemen" },
          { score: 3, label: "Nilai 3", text: "Mampu menjaga hubungan baik dengan rekan kerja dalam satu departemen maupun luar departemen" },
          { score: 4, label: "Nilai 4", text: "Mampu menjaga hubungan baik dalam maupun luar departemen dan mendorong rekan kerja satu departemen untuk menjaga hubungan baik juga" },
          { score: 5, label: "Nilai 5", text: "Mampu menjaga hubungan baik dalam maupun luar departemen dan memberikan contoh yang baik bagi rekan kerja" },
        ],
      },
      {
        no: 2,
        label: "",
        description: "Mampu menjalin interaksi dengan orang-orang dari berbagai tingkat jabatan (termasuk dengan kolega dari perusahaan lain yang masih ada dalam satu grup).",
        indicators: [
          { score: 1, label: "Nilai 1", text: "Tidak mampu menjalin interaksi dengan orang-orang dari berbagai tingkat jabatan" },
          { score: 2, label: "Nilai 2", text: "Mampu menjalin interaksi dengan berbagai tingkat jabatan, namun masih membutuhkan arahan untuk interaksi lintas perusahaan dalam satu grup" },
          { score: 3, label: "Nilai 3", text: "Mampu menjalin interaksi dengan orang-orang dari berbagai tingkat jabatan termasuk kolega dari perusahaan lain dalam satu grup" },
          { score: 4, label: "Nilai 4", text: "Mampu menjalin interaksi positif dan koordinasi yang baik dengan orang-orang dari berbagai tingkat jabatan" },
          { score: 5, label: "Nilai 5", text: "Mampu menjadi orang pertama yang memulai dan menjalin interaksi positif dan koordinasi yang baik lintas tingkat jabatan dan grup" },
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
          { score: 5, label: "Nilai 5", text: "Mampu menjaga, mendorong dan menciptakan kekompakan di tempat kerja dan menunjukkan rasa hormat pada seluruh rekan kerja" },
        ],
      },
    ],
  },
];

export const ALL_APPRAISAL_KEYS = APPRAISAL_FORM_DEFS.flatMap((section) =>
  section.items.map((item) => `${section.id}-${item.no}`),
);

export type AppraisalApproverEntry = {
  actorId: string;
  ratings: Record<string, number>;
  comment: string;
  at: string;
  mirrored?: boolean;
};

export type AppraisalFormDocument = {
  employeeId: string;
  period: string;
  version: number;
  status: string;
  activeStage: number;
  revisionStage: number | null;
  selfRatings: Record<string, number>;
  savedForms: AppraisalFormId[];
  assessments: {
    approver1?: AppraisalApproverEntry;
    approver2?: AppraisalApproverEntry;
  };
  stages: KpiStage[];
  mirrorSecondSlot: boolean;
  snapshot: { unitId: string; level: string; weights: Record<string, number> };
  history: KpiDocument["history"];
};

const pending: Record<string, string> = {
  "approver-1": "Pending-Approver 1",
  "approver-2": "Pending-Approver 2",
};
const weights: Record<string, Record<string, number>> = {
  operasional: { kpi: 50, "smart-goals": 20, "appraisal-form": 15, project: 15 },
  seksi: { kpi: 50, "smart-goals": 20, "appraisal-form": 15, project: 15 },
  bagian: { kpi: 40, "smart-goals": 15, "appraisal-form": 15, project: 15, "manager-skill": 15 },
  departemen: { kpi: 40, "smart-goals": 15, "appraisal-form": 15, project: 10, "manager-skill": 20 },
  divisi: { kpi: 40, "smart-goals": 10, "appraisal-form": 10, project: 10, "manager-skill": 20, "management-interview": 10 },
};

export function createAppraisalFormDocument(employeeId: string): AppraisalFormDocument {
  const employee = simulationEmployees.find((record) => record.id === employeeId);
  const assignment = simulationAssignments.find(
    (record) => record.employeeId === employeeId && record.module === "appraisal-form" && record.phase === "measurement",
  );
  if (!employee || !assignment || !assignment.complete || !simulationUnits.some((unit) => unit.id === employee.unitId)) {
    throw new WorkflowError("Penugasan Appraisal Form belum lengkap atau peserta tidak berlaku.");
  }
  if (assignment.stages.some((stage) => stage.actorId === employeeId)) {
    throw new WorkflowError("Pengajuan sendiri tidak boleh dinilai sendiri oleh atasan yang sama.");
  }
  return {
    employeeId,
    period: employee.period,
    version: 0,
    status: "Draft",
    activeStage: -1,
    revisionStage: null,
    selfRatings: {},
    savedForms: [],
    assessments: {},
    stages: assignment.stages.map((stage) => ({ stage: stage.stage, actorId: stage.actorId! })),
    mirrorSecondSlot: assignment.mirrorSecondSlot,
    snapshot: { unitId: employee.unitId, level: employee.level, weights: { ...weights[employee.level] } },
    history: [],
  };
}

export function canReadAppraisalForm(document: AppraisalFormDocument, actorId: string, strategic: boolean) {
  return (
    strategic ||
    document.employeeId === actorId ||
    (document.status !== "Draft" && document.stages.some((stage) => stage.actorId === actorId))
  );
}

export function validateAppraisalFormRatings(ratings: Record<string, number> | undefined, requireAll: boolean, label: string) {
  if (!ratings || typeof ratings !== "object") {
    throw new WorkflowError(`Data nilai ${label} tidak valid.`);
  }
  for (const [key, val] of Object.entries(ratings)) {
    if (!ALL_APPRAISAL_KEYS.includes(key) || !Number.isInteger(val) || val < 1 || val > 5) {
      throw new WorkflowError(`Nilai untuk kompetensi ${key} harus berupa bilangan bulat 1–5.`);
    }
  }
  if (requireAll) {
    for (const section of APPRAISAL_FORM_DEFS) {
      for (const item of section.items) {
        const val = ratings[`${section.id}-${item.no}`];
        if (!Number.isInteger(val) || val < 1 || val > 5) {
          throw new WorkflowError(`Lengkapi seluruh penilaian ${section.tab} (kompetensi No. ${item.no}) dengan nilai 1–5.`);
        }
      }
    }
  }
}

export function transitionAppraisalForm(
  document: AppraisalFormDocument,
  input: {
    action: KpiAction;
    actorId: string;
    ratings?: Record<string, number>;
    savedForms?: AppraisalFormId[];
    note?: string;
    now: string;
    window: KpiWindow | null;
  },
): AppraisalFormDocument {
  assertWindowOpen(input.window, input.now, "Appraisal Form");
  if (input.note !== undefined && (typeof input.note !== "string" || input.note.length > 10000)) {
    throw new WorkflowError("Catatan harus berupa teks.");
  }
  if (document.status === "Validated") {
    throw new WorkflowError("Appraisal Form yang sudah selesai dinilai (Validated) terkunci.");
  }
  const next = structuredClone(document);
  const owner = input.actorId === document.employeeId;
  let eventStage: string | null = null;

  if (input.action === "save" || input.action === "submit") {
    if (!owner || document.status !== "Draft") {
      throw new WorkflowError("Hanya pemilik dapat mengisi atau menyimpan Self-Assessment pada saat Draft.");
    }
    if (input.ratings !== undefined) {
      validateAppraisalFormRatings(input.ratings, input.action === "submit", "Self-Assessment");
      next.selfRatings = structuredClone(input.ratings);
    } else if (input.action === "submit") {
      validateAppraisalFormRatings(next.selfRatings, true, "Self-Assessment");
    }
    if (input.savedForms !== undefined) {
      const validForms = input.savedForms.filter((f): f is AppraisalFormId => ["A", "B", "C"].includes(f));
      next.savedForms = [...new Set(validForms)];
    }
    if (input.action === "submit") {
      next.savedForms = ["A", "B", "C"];
      next.activeStage = 0;
      next.status = pending[next.stages[0].stage];
    }
  } else if (input.action === "advance") {
    const active = next.stages[next.activeStage];
    if (owner || !active || active.actorId !== input.actorId || next.status !== pending[active.stage]) {
      throw new WorkflowError("Penilaian hanya boleh disubmit oleh Approver tahap aktif yang ditugaskan.");
    }
    validateAppraisalFormRatings(input.ratings, true, active.stage === "approver-1" ? "Approver 1" : "Approver 2");
    eventStage = active.stage;
    const cleanRatings = Object.fromEntries(ALL_APPRAISAL_KEYS.map((key) => [key, input.ratings![key]]));
    if (active.stage === "approver-1") {
      next.assessments.approver1 = {
        actorId: input.actorId,
        ratings: cleanRatings,
        comment: input.note?.trim() ?? "",
        at: input.now,
      };
      if (next.mirrorSecondSlot) {
        next.assessments.approver2 = {
          actorId: input.actorId,
          ratings: { ...cleanRatings },
          comment: "sesuai catatan approver 1",
          at: input.now,
          mirrored: true,
        };
      }
    } else if (active.stage === "approver-2") {
      next.assessments.approver2 = {
        actorId: input.actorId,
        ratings: cleanRatings,
        comment: input.note?.trim() ?? "",
        at: input.now,
      };
    }
    next.activeStage += 1;
    next.status = next.activeStage === next.stages.length ? "Validated" : pending[next.stages[next.activeStage].stage];
  } else {
    throw new WorkflowError("Appraisal Form menggunakan alur Self-Assessment → Evaluasi Approver 1 → Evaluasi Approver 2 (tanpa revisi).");
  }

  next.version += 1;
  next.history.push({
    action: input.action,
    actorId: input.actorId,
    stage: eventStage,
    status: next.status,
    note: input.note?.trim() ?? "",
    at: input.now,
    version: next.version,
  });
  if (input.action === "advance" && eventStage === "approver-1" && next.mirrorSecondSlot) {
    next.history.push({
      action: "advance",
      actorId: input.actorId,
      stage: "approver-2",
      status: next.status,
      note: "sesuai catatan approver 1",
      at: input.now,
      version: next.version,
      mirrored: true,
    });
  }
  return next;
}

export function calculateAppraisalFormScore(document: AppraisalFormDocument | undefined) {
  if (!document) {
    return {
      complete: false,
      forms: [],
      grandSelf: null,
      grandApp1: null,
      grandApp2: null,
      grandCombined: null,
      score: null,
      weightedScore: null,
    };
  }
  const forms = APPRAISAL_FORM_DEFS.map((section) => {
    const keys = section.items.map((item) => `${section.id}-${item.no}`);
    const avgFrom = (map: Record<string, number> | undefined) => {
      if (!map) return null;
      const vals = keys.map((k) => map[k]).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
      if (vals.length !== keys.length) return null;
      return Number((vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(2));
    };
    const selfAvg = avgFrom(document.selfRatings);
    const app1Avg = avgFrom(document.assessments.approver1?.ratings);
    const app2Avg = avgFrom(document.assessments.approver2?.ratings);
    const available = [selfAvg, app1Avg, app2Avg].filter((v): v is number => v !== null);
    const combinedAvg = available.length === 3 ? Number(((selfAvg! + app1Avg! + app2Avg!) / 3).toFixed(2)) : null;
    const weightedPct = combinedAvg !== null ? Number(((combinedAvg / 5) * section.percentage).toFixed(2)) : null;
    return {
      formId: section.id,
      title: section.tab,
      percentage: section.percentage,
      selfAvg,
      app1Avg,
      app2Avg,
      combinedAvg,
      weightedPct,
    };
  });

  const meanOf = (values: (number | null)[]) => {
    const valid = values.filter((v): v is number => v !== null);
    return valid.length === forms.length ? Number((valid.reduce((s, v) => s + v, 0) / valid.length).toFixed(2)) : null;
  };
  const grandSelf = meanOf(forms.map((f) => f.selfAvg));
  const grandApp1 = meanOf(forms.map((f) => f.app1Avg));
  const grandApp2 = meanOf(forms.map((f) => f.app2Avg));
  const grandCombined = meanOf(forms.map((f) => f.combinedAvg));
  const complete = document.status === "Validated" && forms.every((f) => f.weightedPct !== null);
  const score = complete ? Number(forms.reduce((s, f) => s + (f.weightedPct ?? 0), 0).toFixed(2)) : null;
  const moduleWeight = document.snapshot.weights["appraisal-form"] ?? 0;
  const weightedScore = score !== null ? Number(((score * moduleWeight) / 100).toFixed(2)) : null;

  return {
    complete,
    forms,
    grandSelf,
    grandApp1,
    grandApp2,
    grandCombined,
    score,
    weightedScore,
  };
}
