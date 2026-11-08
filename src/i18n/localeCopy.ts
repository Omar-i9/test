import type { LocaleCode } from './languages';
import type { RouteId } from '../config/routes';

export type FirstVisitStepId = 'home' | 'tactical' | 'matches' | 'archive' | 'stadiums' | 'analytics' | 'settings' | 'assistant';
export type FirstVisitStepCopy = { title: string; description: string; hint: string };

export const FIRST_VISIT_COPY: Record<LocaleCode, {
  eyebrow: string; welcomeTitle: string; welcomeDescription: string; startTour: string; continueGuest: string;
  tourEyebrow: string; quickTip: string; next: string; previous: string; skip: string; close: string;
  completeTitle: string; completeDescription: string; assistantDescription: string; assistantCta: string; finish: string; targetMissing: string; stepLabel: (current: number, total: number) => string;
  steps: Record<FirstVisitStepId, FirstVisitStepCopy>;
}> = {
  ar: {
    eyebrow: 'TAAMEN / بداية سريعة', welcomeTitle: 'مرحبًا بك في TAAMEN',
    welcomeDescription: 'اكتشف مساحة متكاملة لتنظيم تجربتك الكروية وإدارة المباريات والخطط التكتيكية.',
    startTour: 'تعرّف على TAAMEN', continueGuest: 'المتابعة كزائر', tourEyebrow: 'الجولة التفاعلية في TAAMEN',
    quickTip: 'معلومة سريعة', next: 'التالي', previous: 'السابق', skip: 'تخطي الجولة', close: 'إغلاق الجولة',
    completeTitle: 'أصبحت جاهزًا لاكتشاف TAAMEN!',
    completeDescription: 'يمكنك إعادة هذه الجولة من الإعدادات متى احتجت. هل تريد مساعدة إضافية في فهم الموقع أو أدواته؟',
    assistantDescription: 'هل تحتاج إلى مساعدة إضافية؟ يمكنك سؤال TAAMEN AI عن طريقة استخدام الموقع وأدواته. سيستخدم الخدمة الفعلية عند توفر الاتصال وبعد موافقتك.', finish: 'إنهاء', targetMissing: 'لم يظهر عنصر التمييز في هذه الصفحة؛ يمكنك متابعة الجولة بأمان.',
    assistantCta: 'اسأل TAAMEN AI', stepLabel: (current, total) => `${current} / ${total}`,
    steps: {
      home: { title: 'الرئيسية', description: 'هذه نقطة البداية في TAAMEN. منها تراجع ملخص نشاطك، والمباريات الأخيرة، والاختصارات المؤدية إلى أقسام المنتج.', hint: 'المعلومات المعروضة تعتمد على السجلات المتاحة على هذا الجهاز.' },
      tactical: { title: 'الملعب التكتيكي', description: 'رتّب اللاعبين على الملعب، واختر صيغة 5 ضد 5 أو 7 ضد 7، ثم استخدم أدوات الرسم المتاحة لشرح التمرير والتحرك والضغط والتغطية.', hint: 'المسودة الحالية محلية. مكتبة الخطط السحابية تتطلب حسابًا موثقًا.' },
      matches: { title: 'مركز المباريات', description: 'أنشئ مباراة وسجّل الفريقين والموعد والملعب والمدينة ونوع المواجهة. بعد انتهاء المباراة، أدخل النتيجة والمساهمات المتاحة.', hint: 'الحفظ والتعديل يتطلبان ملفًا محليًا على هذا الجهاز.' },
      archive: { title: 'الأرشيف', description: 'ارجع إلى المباريات المكتملة ونتائجها وتفاصيلها. الأرشيف مشتق من سجلات المباريات المحلية وليس قاعدة منفصلة مكررة.', hint: 'السجلات الخاصة تبقى خاصة ولا تدخل في المشاركة العامة.' },
      stadiums: { title: 'الملاعب', description: 'استكشف دليل الملاعب، وابحث بالاسم أو المدينة، وافتح تفاصيل الملعب عند تجهيز مباراة.', hint: 'استخدم البحث للوصول بسرعة إلى الملعب أو المدينة.' },
      analytics: { title: 'التحليلات', description: 'راجع النتائج والأهداف والتمريرات الحاسمة والتقييمات الذاتية والاتجاهات التي تدعمها السجلات التي أدخلتها.', hint: 'لا يتم اختراع بيانات مفقودة؛ الحقول غير المسجلة لا تُعامل كأصفار.' },
      settings: { title: 'الإعدادات', description: 'غيّر اللغة والمظهر، وأدر الخصوصية والإشعارات وتفضيلات الجهاز، وصدّر نسخة احتياطية من بياناتك المحلية.', hint: 'إنشاء حساب سحابي لا ينقل بيانات الجهاز تلقائيًا.' },
      assistant: { title: 'TAAMEN AI', description: 'المساعد يشرح وظائف TAAMEN ويساعدك في فهم الأدوات التكتيكية وبيانات المباريات التي تختار مشاركتها بعد الموافقة.', hint: 'إرسال الأسئلة يتطلب ملفًا محليًا وموافقة مستقلة واتصالًا فعليًا بالخدمة.' },
    },
  },
  en: {
    eyebrow: 'TAAMEN / QUICK START', welcomeTitle: 'Welcome to TAAMEN',
    welcomeDescription: 'Discover one space to organize your football experience, manage matches, and build tactical plans.',
    startTour: 'Explore TAAMEN', continueGuest: 'Continue as guest', tourEyebrow: 'TAAMEN INTERACTIVE TOUR',
    quickTip: 'QUICK TIP', next: 'Next', previous: 'Back', skip: 'Skip tour', close: 'Close tour',
    completeTitle: 'You are ready to explore TAAMEN!',
    completeDescription: 'You can replay this tour from Settings at any time. Need more help understanding the product or its tools?',
    assistantDescription: 'Need more help? Ask TAAMEN AI how to use the product and its tools. The real service is used only when it is configured, connected, and you have consented.', finish: 'Finish', targetMissing: 'The highlight target was not found on this page. You can safely continue.',
    assistantCta: 'Ask TAAMEN AI', stepLabel: (current, total) => `${current} / ${total}`,
    steps: {
      home: { title: 'Home', description: 'This is your starting point. Review your activity summary, recent matches, and shortcuts to the main product areas.', hint: 'Displayed information is based on records available on this device.' },
      tactical: { title: 'Tactical Board', description: 'Arrange players on the pitch, choose 5-a-side or 7-a-side, and use the available drawing tools to explain passes, runs, pressing, and coverage.', hint: 'Your working draft is local. The cloud plan library requires a verified account.' },
      matches: { title: 'Match Center', description: 'Create a match and record both teams, kickoff, venue, city, and match type. After the match, enter the result and available contributions.', hint: 'Saving and editing require a local profile on this device.' },
      archive: { title: 'Archive', description: 'Return to completed matches, scores, and details. The archive is projected from your local match records rather than duplicated in a separate store.', hint: 'Private records stay private and are excluded from public sharing.' },
      stadiums: { title: 'Stadiums', description: 'Explore the stadium directory, search by venue or city, and open a venue’s details while preparing a match.', hint: 'Use search to find a stadium or city quickly.' },
      analytics: { title: 'Analytics', description: 'Review results, goals, assists, self-assessments, and trends supported by the records you entered.', hint: 'Missing information is not invented; unrecorded values are not treated as zero.' },
      settings: { title: 'Settings', description: 'Change language and appearance, manage privacy, notifications, and device preferences, and export a backup of local data.', hint: 'Creating a cloud account does not automatically transfer device data.' },
      assistant: { title: 'TAAMEN AI', description: 'The assistant can explain TAAMEN features, tactical tools, and match data you explicitly choose to share after consent.', hint: 'Sending questions requires a local profile, separate consent, and a real service connection.' },
    },
  },
  es: {
    eyebrow: 'TAAMEN / INICIO RÁPIDO', welcomeTitle: 'Te damos la bienvenida a TAAMEN',
    welcomeDescription: 'Descubre un espacio para organizar tu experiencia futbolística, gestionar partidos y crear planes tácticos.',
    startTour: 'Descubrir TAAMEN', continueGuest: 'Continuar como invitado', tourEyebrow: 'RECORRIDO INTERACTIVO DE TAAMEN',
    quickTip: 'CONSEJO RÁPIDO', next: 'Siguiente', previous: 'Anterior', skip: 'Omitir recorrido', close: 'Cerrar recorrido',
    completeTitle: '¡Ya puedes descubrir TAAMEN!',
    completeDescription: 'Puedes repetir este recorrido desde Ajustes cuando quieras. ¿Necesitas más ayuda para entender el producto o sus herramientas?',
    assistantDescription: '¿Necesitas más ayuda? Pregunta a TAAMEN AI cómo utilizar el producto y sus herramientas. El servicio real requiere configuración, conexión y tu consentimiento.', finish: 'Finalizar', targetMissing: 'No se encontró el elemento destacado en esta página. Puedes continuar con seguridad.',
    assistantCta: 'Preguntar a TAAMEN AI', stepLabel: (current, total) => `${current} / ${total}`,
    steps: {
      home: { title: 'Inicio', description: 'Este es tu punto de partida. Consulta el resumen de actividad, los partidos recientes y los accesos a las secciones principales.', hint: 'La información mostrada depende de los registros disponibles en este dispositivo.' },
      tactical: { title: 'Pizarra táctica', description: 'Coloca a los jugadores en el campo, elige fútbol 5 o fútbol 7 y utiliza las herramientas disponibles para representar pases, desmarques, presión y coberturas.', hint: 'El borrador actual es local. La biblioteca en la nube requiere una cuenta verificada.' },
      matches: { title: 'Centro de partidos', description: 'Crea un partido e introduce ambos equipos, la hora, el campo, la ciudad y el tipo de encuentro. Después registra el resultado y las contribuciones disponibles.', hint: 'Guardar y editar requiere un perfil local en este dispositivo.' },
      archive: { title: 'Archivo', description: 'Consulta los partidos finalizados, sus resultados y detalles. El archivo se genera a partir de tus registros locales.', hint: 'Los registros privados siguen siendo privados y no se comparten públicamente.' },
      stadiums: { title: 'Estadios', description: 'Explora el directorio de campos, busca por nombre o ciudad y consulta los detalles al preparar un partido.', hint: 'Utiliza la búsqueda para encontrar rápidamente un campo o una ciudad.' },
      analytics: { title: 'Analíticas', description: 'Consulta resultados, goles, asistencias, autoevaluaciones y tendencias respaldadas por los datos que registraste.', hint: 'No se inventan datos ausentes; los valores no registrados no cuentan como cero.' },
      settings: { title: 'Ajustes', description: 'Cambia el idioma y la apariencia, administra la privacidad, las notificaciones y las preferencias del dispositivo, y exporta una copia de seguridad local.', hint: 'Crear una cuenta en la nube no transfiere automáticamente los datos del dispositivo.' },
      assistant: { title: 'TAAMEN AI', description: 'El asistente puede explicar las funciones de TAAMEN, las herramientas tácticas y los datos de partidos que decidas compartir tras dar tu consentimiento.', hint: 'Para enviar preguntas se necesita un perfil local, consentimiento independiente y una conexión real al servicio.' },
    },
  },
  fr: {
    eyebrow: 'TAAMEN / DÉMARRAGE RAPIDE', welcomeTitle: 'Bienvenue sur TAAMEN',
    welcomeDescription: 'Découvrez un espace pour organiser votre expérience du football, gérer vos matchs et préparer vos plans tactiques.',
    startTour: 'Découvrir TAAMEN', continueGuest: 'Continuer en invité', tourEyebrow: 'VISITE INTERACTIVE DE TAAMEN',
    quickTip: 'CONSEIL RAPIDE', next: 'Suivant', previous: 'Précédent', skip: 'Passer la visite', close: 'Fermer la visite',
    completeTitle: 'Vous êtes prêt à découvrir TAAMEN !',
    completeDescription: 'Vous pouvez relancer cette visite depuis les paramètres. Besoin d’aide pour comprendre le produit ou ses outils ?',
    assistantDescription: 'Besoin d’aide supplémentaire ? Demandez à TAAMEN AI comment utiliser le produit et ses outils. Le service réel nécessite une configuration, une connexion et votre consentement.', finish: 'Terminer', targetMissing: 'La zone à mettre en évidence est introuvable sur cette page. Vous pouvez continuer.',
    assistantCta: 'Demander à TAAMEN AI', stepLabel: (current, total) => `${current} / ${total}`,
    steps: {
      home: { title: 'Accueil', description: 'C’est votre point de départ. Consultez le résumé de votre activité, les matchs récents et les raccourcis vers les sections principales.', hint: 'Les informations affichées dépendent des données disponibles sur cet appareil.' },
      tactical: { title: 'Tableau tactique', description: 'Placez les joueurs sur le terrain, choisissez le format à 5 ou à 7 et utilisez les outils disponibles pour illustrer les passes, les appels, le pressing et la couverture.', hint: 'Votre brouillon est local. La bibliothèque cloud nécessite un compte vérifié.' },
      matches: { title: 'Centre des matchs', description: 'Créez un match et saisissez les deux équipes, l’horaire, le terrain, la ville et le type de rencontre. Enregistrez ensuite le résultat et les contributions disponibles.', hint: 'L’enregistrement et la modification nécessitent un profil local sur cet appareil.' },
      archive: { title: 'Archives', description: 'Retrouvez les matchs terminés, leurs résultats et leurs détails. Les archives sont générées à partir de vos enregistrements locaux.', hint: 'Les données privées restent privées et ne sont pas partagées publiquement.' },
      stadiums: { title: 'Terrains', description: 'Explorez le répertoire des terrains, recherchez par nom ou par ville et consultez les détails lors de la préparation d’un match.', hint: 'Utilisez la recherche pour trouver rapidement un terrain ou une ville.' },
      analytics: { title: 'Analyses', description: 'Consultez les résultats, les buts, les passes décisives, les auto-évaluations et les tendances étayées par vos données.', hint: 'Aucune donnée manquante n’est inventée ; une valeur non renseignée n’est pas considérée comme zéro.' },
      settings: { title: 'Paramètres', description: 'Modifiez la langue et l’apparence, gérez la confidentialité, les notifications et les préférences de l’appareil, puis exportez une sauvegarde locale.', hint: 'Créer un compte cloud ne transfère pas automatiquement les données de l’appareil.' },
      assistant: { title: 'TAAMEN AI', description: 'L’assistant peut expliquer les fonctions de TAAMEN, les outils tactiques et les données de match que vous choisissez de partager après consentement.', hint: 'L’envoi de questions nécessite un profil local, un consentement distinct et une connexion réelle au service.' },
    },
  },
  de: {
    eyebrow: 'TAAMEN / SCHNELLSTART', welcomeTitle: 'Willkommen bei TAAMEN',
    welcomeDescription: 'Entdecke einen Ort, an dem du dein Fußballerlebnis organisierst, Spiele verwaltest und taktische Pläne erstellst.',
    startTour: 'TAAMEN entdecken', continueGuest: 'Als Gast fortfahren', tourEyebrow: 'INTERAKTIVE TAAMEN-TOUR',
    quickTip: 'KURZER TIPP', next: 'Weiter', previous: 'Zurück', skip: 'Tour überspringen', close: 'Tour schließen',
    completeTitle: 'Du bist bereit, TAAMEN zu entdecken!',
    completeDescription: 'Du kannst die Tour jederzeit in den Einstellungen erneut starten. Brauchst du weitere Hilfe zu TAAMEN oder seinen Werkzeugen?',
    assistantDescription: 'Brauchst du weitere Hilfe? Frage TAAMEN AI, wie du das Produkt und seine Werkzeuge verwendest. Der echte Dienst benötigt Konfiguration, Verbindung und deine Zustimmung.', finish: 'Beenden', targetMissing: 'Das Hervorhebungsziel wurde auf dieser Seite nicht gefunden. Du kannst sicher fortfahren.',
    assistantCta: 'TAAMEN AI fragen', stepLabel: (current, total) => `${current} / ${total}`,
    steps: {
      home: { title: 'Startseite', description: 'Hier beginnt deine Nutzung. Sieh dir die Aktivitätsübersicht, aktuelle Spiele und Verknüpfungen zu den wichtigsten Bereichen an.', hint: 'Die angezeigten Informationen basieren auf den Daten auf diesem Gerät.' },
      tactical: { title: 'Taktiktafel', description: 'Platziere Spieler auf dem Feld, wähle 5-gegen-5 oder 7-gegen-7 und nutze die verfügbaren Werkzeuge für Pässe, Laufwege, Pressing und Absicherung.', hint: 'Dein Entwurf wird lokal gespeichert. Die Cloud-Planbibliothek benötigt ein verifiziertes Konto.' },
      matches: { title: 'Spielcenter', description: 'Erstelle ein Spiel und gib beide Teams, Anstoßzeit, Platz, Stadt und Spieltyp ein. Trage nach dem Spiel das Ergebnis und verfügbare Beiträge ein.', hint: 'Speichern und Bearbeiten erfordern ein lokales Profil auf diesem Gerät.' },
      archive: { title: 'Archiv', description: 'Rufe beendete Spiele, Ergebnisse und Details auf. Das Archiv wird aus deinen lokalen Spieldatensätzen abgeleitet.', hint: 'Private Einträge bleiben privat und werden nicht öffentlich geteilt.' },
      stadiums: { title: 'Spielstätten', description: 'Durchsuche das Verzeichnis nach Platz oder Stadt und öffne die Details bei der Vorbereitung eines Spiels.', hint: 'Mit der Suche findest du einen Platz oder eine Stadt schneller.' },
      analytics: { title: 'Analysen', description: 'Prüfe Ergebnisse, Tore, Vorlagen, Selbsteinschätzungen und Trends, die durch deine gespeicherten Daten belegt sind.', hint: 'Fehlende Daten werden nicht erfunden; nicht eingetragene Werte gelten nicht als null.' },
      settings: { title: 'Einstellungen', description: 'Ändere Sprache und Darstellung, verwalte Datenschutz, Benachrichtigungen und Geräteeinstellungen und exportiere eine lokale Sicherung.', hint: 'Ein Cloud-Konto überträgt Gerätedaten nicht automatisch.' },
      assistant: { title: 'TAAMEN AI', description: 'Der Assistent erklärt TAAMEN-Funktionen, Taktikwerkzeuge und Spieldaten, die du nach deiner Zustimmung ausdrücklich teilst.', hint: 'Zum Senden von Fragen brauchst du ein lokales Profil, eine separate Zustimmung und eine echte Verbindung zum Dienst.' },
    },
  },
  pt: {
    eyebrow: 'TAAMEN / INÍCIO RÁPIDO', welcomeTitle: 'Boas-vindas ao TAAMEN',
    welcomeDescription: 'Descubra um espaço para organizar a sua experiência no futebol, gerir partidas e criar planos táticos.',
    startTour: 'Explorar o TAAMEN', continueGuest: 'Continuar como visitante', tourEyebrow: 'VISITA INTERATIVA DO TAAMEN',
    quickTip: 'DICA RÁPIDA', next: 'Seguinte', previous: 'Anterior', skip: 'Ignorar visita', close: 'Fechar visita',
    completeTitle: 'Está pronto para explorar o TAAMEN!',
    completeDescription: 'Pode repetir esta visita nas Definições quando quiser. Precisa de mais ajuda para compreender o produto ou as ferramentas?',
    assistantDescription: 'Precisa de mais ajuda? Pergunte ao TAAMEN AI como utilizar o produto e as ferramentas. O serviço real exige configuração, ligação e o seu consentimento.', finish: 'Concluir', targetMissing: 'O elemento a destacar não foi encontrado nesta página. Pode continuar em segurança.',
    assistantCta: 'Perguntar ao TAAMEN AI', stepLabel: (current, total) => `${current} / ${total}`,
    steps: {
      home: { title: 'Início', description: 'Este é o seu ponto de partida. Consulte o resumo da atividade, as partidas recentes e os atalhos para as principais áreas do produto.', hint: 'As informações apresentadas baseiam-se nos registos disponíveis neste dispositivo.' },
      tactical: { title: 'Quadro tático', description: 'Posicione os jogadores no campo, escolha futebol de 5 ou de 7 e utilize as ferramentas disponíveis para representar passes, movimentos, pressão e cobertura.', hint: 'O rascunho atual é local. A biblioteca de planos na nuvem requer uma conta verificada.' },
      matches: { title: 'Centro de partidas', description: 'Crie uma partida e registe as duas equipas, o horário, o campo, a cidade e o tipo de encontro. Depois, introduza o resultado e as contribuições disponíveis.', hint: 'Guardar e editar requer um perfil local neste dispositivo.' },
      archive: { title: 'Arquivo', description: 'Consulte partidas concluídas, resultados e detalhes. O arquivo é derivado dos seus registos locais de partidas.', hint: 'Os registos privados continuam privados e não são partilhados publicamente.' },
      stadiums: { title: 'Campos', description: 'Explore o diretório de campos, pesquise por nome ou cidade e consulte os detalhes ao preparar uma partida.', hint: 'Utilize a pesquisa para encontrar rapidamente um campo ou uma cidade.' },
      analytics: { title: 'Análises', description: 'Consulte resultados, golos, assistências, autoavaliações e tendências apoiadas pelos registos que introduziu.', hint: 'Os dados em falta não são inventados; valores não registados não são tratados como zero.' },
      settings: { title: 'Definições', description: 'Altere o idioma e a aparência, gira a privacidade, as notificações e as preferências do dispositivo e exporte uma cópia de segurança local.', hint: 'Criar uma conta na nuvem não transfere automaticamente os dados do dispositivo.' },
      assistant: { title: 'TAAMEN AI', description: 'O assistente pode explicar as funcionalidades do TAAMEN, as ferramentas táticas e os dados de partidas que decidir partilhar após consentimento.', hint: 'O envio de perguntas requer um perfil local, consentimento separado e uma ligação real ao serviço.' },
    },
  },
  tr: {
    eyebrow: 'TAAMEN / HIZLI BAŞLANGIÇ', welcomeTitle: 'TAAMEN’e hoş geldiniz',
    welcomeDescription: 'Futbol deneyiminizi düzenlemek, maçları yönetmek ve taktik planlar oluşturmak için tek bir alanı keşfedin.',
    startTour: 'TAAMEN’i keşfet', continueGuest: 'Misafir olarak devam et', tourEyebrow: 'TAAMEN ETKİLEŞİMLİ TURU',
    quickTip: 'KISA İPUCU', next: 'İleri', previous: 'Geri', skip: 'Turu atla', close: 'Turu kapat',
    completeTitle: 'TAAMEN’i keşfetmeye hazırsınız!',
    completeDescription: 'Bu turu istediğiniz zaman Ayarlar bölümünden yeniden başlatabilirsiniz. Ürünü veya araçlarını anlamak için daha fazla yardıma mı ihtiyacınız var?',
    assistantDescription: 'Daha fazla yardıma mı ihtiyacınız var? TAAMEN AI’ye ürünü ve araçlarını nasıl kullanacağınızı sorabilirsiniz. Gerçek hizmet için yapılandırma, bağlantı ve onay gerekir.', finish: 'Bitir', targetMissing: 'Vurgulanacak öğe bu sayfada bulunamadı. Güvenle devam edebilirsiniz.',
    assistantCta: 'TAAMEN AI’ye sor', stepLabel: (current, total) => `${current} / ${total}`,
    steps: {
      home: { title: 'Ana sayfa', description: 'Başlangıç noktanız burasıdır. Etkinlik özetinizi, son maçları ve ürünün ana bölümlerine giden kısayolları inceleyin.', hint: 'Gösterilen bilgiler bu cihazda bulunan kayıtlara dayanır.' },
      tactical: { title: 'Taktik tahtası', description: 'Oyuncuları sahaya yerleştirin, 5’e 5 veya 7’ye 7 formatını seçin ve mevcut araçlarla pasları, koşuları, presi ve alan paylaşımını gösterin.', hint: 'Çalışma taslağınız yerel olarak saklanır. Bulut plan kitaplığı doğrulanmış hesap gerektirir.' },
      matches: { title: 'Maç merkezi', description: 'Bir maç oluşturun; iki takımı, başlama saatini, sahayı, şehri ve maç türünü girin. Maçtan sonra sonucu ve mevcut katkıları kaydedin.', hint: 'Kaydetmek ve düzenlemek için bu cihazda yerel profil gerekir.' },
      archive: { title: 'Arşiv', description: 'Tamamlanan maçları, sonuçları ve ayrıntıları görüntüleyin. Arşiv, yerel maç kayıtlarınızdan oluşturulur.', hint: 'Özel kayıtlar gizli kalır ve herkese açık paylaşımda yer almaz.' },
      stadiums: { title: 'Sahalar', description: 'Saha rehberini keşfedin, ada veya şehre göre arama yapın ve maç hazırlarken saha ayrıntılarını açın.', hint: 'Bir sahayı veya şehri hızlıca bulmak için aramayı kullanın.' },
      analytics: { title: 'Analizler', description: 'Kaydettiğiniz verilerle desteklenen sonuçları, golleri, asistleri, öz değerlendirmeleri ve eğilimleri inceleyin.', hint: 'Eksik veriler uydurulmaz; kaydedilmemiş değerler sıfır sayılmaz.' },
      settings: { title: 'Ayarlar', description: 'Dili ve görünümü değiştirin; gizliliği, bildirimleri ve cihaz tercihlerini yönetin; yerel verilerinizin yedeğini dışa aktarın.', hint: 'Bulut hesabı oluşturmak cihaz verilerini otomatik olarak aktarmaz.' },
      assistant: { title: 'TAAMEN AI', description: 'Asistan, TAAMEN özelliklerini, taktik araçlarını ve izninizden sonra paylaşmayı seçtiğiniz maç verilerini açıklayabilir.', hint: 'Soru göndermek için yerel profil, ayrı onay ve hizmete gerçek bağlantı gerekir.' },
    },
  },
};

const NAV_LABELS: Record<LocaleCode, Partial<Record<RouteId, string>>> = {
  ar: { home: 'الرئيسية', stadiums: 'الملاعب', play: 'مساحة اللعب', analytics: 'تحليلاتي', assistant: 'TAAMEN AI', 'match-center': 'مركز المباريات', archive: 'الأرشيف', profile: 'الملف الشخصي', tactical: 'الملعب التكتيكي', 'account-hub': 'الحساب والإعدادات', support: 'الدعم', settings: 'الإعدادات' },
  en: { home: 'Home', stadiums: 'Stadiums', play: 'Play Space', analytics: 'My Analytics', assistant: 'TAAMEN AI', 'match-center': 'Match Center', archive: 'Archive', profile: 'Profile', tactical: 'Tactical Board', 'account-hub': 'Account & Settings', support: 'Support', settings: 'Settings' },
  es: { home: 'Inicio', stadiums: 'Estadios', play: 'Espacio de juego', analytics: 'Mis análisis', assistant: 'TAAMEN AI', 'match-center': 'Centro de partidos', archive: 'Archivo', profile: 'Perfil', tactical: 'Pizarra táctica', 'account-hub': 'Cuenta y ajustes', support: 'Ayuda', settings: 'Ajustes' },
  fr: { home: 'Accueil', stadiums: 'Terrains', play: 'Espace de jeu', analytics: 'Mes analyses', assistant: 'TAAMEN AI', 'match-center': 'Centre des matchs', archive: 'Archives', profile: 'Profil', tactical: 'Tableau tactique', 'account-hub': 'Compte et paramètres', support: 'Assistance', settings: 'Paramètres' },
  de: { home: 'Startseite', stadiums: 'Spielstätten', play: 'Spielbereich', analytics: 'Meine Analysen', assistant: 'TAAMEN AI', 'match-center': 'Spielcenter', archive: 'Archiv', profile: 'Profil', tactical: 'Taktiktafel', 'account-hub': 'Konto & Einstellungen', support: 'Support', settings: 'Einstellungen' },
  pt: { home: 'Início', stadiums: 'Campos', play: 'Área de jogo', analytics: 'As minhas análises', assistant: 'TAAMEN AI', 'match-center': 'Centro de partidas', archive: 'Arquivo', profile: 'Perfil', tactical: 'Quadro tático', 'account-hub': 'Conta e definições', support: 'Suporte', settings: 'Definições' },
  tr: { home: 'Ana sayfa', stadiums: 'Sahalar', play: 'Oyun alanı', analytics: 'Analizlerim', assistant: 'TAAMEN AI', 'match-center': 'Maç merkezi', archive: 'Arşiv', profile: 'Profil', tactical: 'Taktik tahtası', 'account-hub': 'Hesap ve ayarlar', support: 'Destek', settings: 'Ayarlar' },
};

export function getLocalizedRouteLabel(route: RouteId, locale: LocaleCode, fallback: string): string {
  return NAV_LABELS[locale][route] ?? fallback;
}


const SECTION_LABELS: Record<LocaleCode, Record<'core' | 'football' | 'personal' | 'system', string>> = {
  ar: { core: 'الأساسي', football: 'كرة القدم', personal: 'الشخصي', system: 'النظام' },
  en: { core: 'Core', football: 'Football', personal: 'Personal', system: 'System' },
  es: { core: 'Principal', football: 'Fútbol', personal: 'Personal', system: 'Sistema' },
  fr: { core: 'Principal', football: 'Football', personal: 'Personnel', system: 'Système' },
  de: { core: 'Allgemein', football: 'Fußball', personal: 'Persönlich', system: 'System' },
  pt: { core: 'Principal', football: 'Futebol', personal: 'Pessoal', system: 'Sistema' },
  tr: { core: 'Genel', football: 'Futbol', personal: 'Kişisel', system: 'Sistem' },
};

export function getLocalizedSectionLabel(section: 'core' | 'football' | 'personal' | 'system', locale: LocaleCode): string {
  return SECTION_LABELS[locale][section];
}
