export const categories = [
  {
    id: "psychology",
    label: "Psychology",
    topics: [
      {
        id: "memory",
        aliases: ["memory", "human memory", "how memory works"],
        levels: {
          basic: "**Memory** is the ability to encode, store, and retrieve information. Attention affects what gets encoded, and remembering is an active reconstruction rather than a perfect recording.",
          intermediate: "Memory includes interacting processes such as working memory, episodic memory, semantic memory, and procedural learning. Retrieval practice, meaningful organization, sleep, and repeated use can improve retention, while interference, stress, and misleading information can distort recall.",
          advanced: "Memory depends on distributed neural systems and changes across encoding, consolidation, retrieval, reconsolidation, and forgetting. Performance reflects both stored information and retrieval conditions; confidence is useful evidence but is not a direct measure of accuracy.",
        },
      },
      {
        id: "cognitive-bias",
        aliases: ["cognitive bias", "cognitive biases", "biases"],
        levels: {
          basic: "A **cognitive bias** is a systematic tendency in attention, judgment, or decision-making that can pull reasoning away from a fully neutral evaluation.",
          intermediate: "Biases often arise because minds use limited time, information, and effort. Examples include anchoring, availability, confirmation bias, and framing effects. Naming a bias does not prove a conclusion is wrong; it identifies a reason to check the evidence and process.",
          advanced: "Bias research examines how task structure, incentives, prior beliefs, ecological context, and measurement choices shape judgments. Effects are not equally strong in every setting, so claims about a bias should specify the task, population, comparison, and evidence.",
        },
      },
    ],
  },
  {
    id: "health",
    label: "Health and general healthcare",
    topics: [
      {
        id: "sleep",
        aliases: ["sleep", "healthy sleep", "sleep health"],
        levels: {
          basic: "Sleep supports attention, memory, mood regulation, immune function, and physical recovery. Most adults need roughly seven to nine hours, though needs vary.",
          intermediate: "Sleep quality depends on duration, regularity, timing, environment, and individual health. A consistent schedule, daylight exposure, a dark quiet room, and limiting late stimulants can help. Persistent insomnia, breathing pauses, severe daytime sleepiness, or other concerning symptoms deserve professional evaluation.",
          advanced: "Sleep is organized into recurring non-REM and REM states regulated by circadian and homeostatic processes. Sleep loss affects cognition and physiology, but individual responses vary; general advice cannot diagnose a disorder or replace clinical assessment.",
        },
      },
      {
        id: "preventive-healthcare",
        aliases: ["preventive healthcare", "preventive health", "health screening"],
        levels: {
          basic: "Preventive healthcare aims to reduce risk or detect problems early through healthy habits, vaccination, appropriate screening, and timely professional care.",
          intermediate: "The right preventive actions depend on age, sex, family history, exposures, location, and existing conditions. Screening is useful when its benefits, harms, and follow-up options are understood; more testing is not automatically better.",
          advanced: "Preventive decisions balance baseline risk, test accuracy, false positives, false negatives, treatment effectiveness, opportunity costs, and patient preferences. Population guidelines are starting points, not individualized diagnoses.",
        },
      },
    ],
  },
  {
    id: "philosophy",
    label: "Philosophy",
    topics: [
      {
        id: "ethics",
        aliases: ["ethics", "ethical reasoning", "morality", "moral philosophy"],
        levels: {
          basic: "**Ethics** is the study of how actions, choices, and institutions should be evaluated. It asks about duties, consequences, character, fairness, rights, and responsibilities.",
          intermediate: "Major approaches include consequentialism, which emphasizes outcomes; deontology, which emphasizes duties or constraints; and virtue ethics, which emphasizes character and practical judgment. Real decisions often involve conflicts among values rather than one mechanical rule.",
          advanced: "Ethical analysis separates descriptive facts from normative premises and makes value trade-offs explicit. A strong argument identifies affected parties, duties, expected consequences, uncertainty, reversibility, power differences, and principles that would remain acceptable if roles were reversed.",
        },
      },
      {
        id: "epistemology",
        aliases: ["epistemology", "theory of knowledge", "knowledge"],
        levels: {
          basic: "**Epistemology** studies knowledge, belief, evidence, and justification. It asks what makes a belief reliable and how we should respond to uncertainty.",
          intermediate: "Questions include whether a belief is true, justified, reliably formed, and connected to the facts in the right way. Testimony, perception, memory, inference, and disagreement all provide evidence with different strengths and failure modes.",
          advanced: "Epistemic evaluation considers defeaters, calibration, underdetermination, social epistemology, and the limits of foundational certainty. Rational confidence is usually graded rather than binary, and good methods remain open to correction by better evidence.",
        },
      },
    ],
  },
  {
    id: "theories",
    label: "Theories",
    topics: [
      {
        id: "scientific-theory",
        aliases: ["scientific theory", "theory in science", "what is a theory"],
        levels: {
          basic: "In science, a **theory** is a well-supported explanatory framework, not a casual guess. It organizes evidence and makes predictions.",
          intermediate: "A scientific theory connects observations, mechanisms, models, and testable consequences. It can be revised when strong evidence exposes a limitation while remaining useful within the domain where it works.",
          advanced: "Theories are structured families of models with assumptions, idealizations, empirical scope, and links to measurement. Their strength depends on explanatory and predictive performance, coherence with other evidence, and the quality of severe tests—not on being proven with absolute finality.",
        },
      },
    ],
  },
  {
    id: "myths",
    label: "Myths and mythology",
    topics: [
      {
        id: "mythology",
        aliases: ["mythology", "myth", "myths", "mythological"],
        levels: {
          basic: "**Mythology** is the study or body of traditional stories that communities use to express origins, values, heroes, gods, forces of nature, or human problems. Calling a story a myth is a classification, not a judgment about its importance.",
          intermediate: "Myths vary across cultures and can serve religious, social, political, explanatory, or literary functions. Interpretations should consider the tradition's own context rather than treating every story as a literal history report or reducing it to a single universal symbol.",
          advanced: "Myth analysis can compare narrative patterns, ritual settings, transmission, power, identity, and historical change. Categories such as myth, legend, scripture, folklore, and history overlap differently across communities, so classification should remain context-sensitive.",
        },
      },
    ],
  },
  {
    id: "human-behavior-society",
    label: "Human behavior and society",
    topics: [
      {
        id: "social-norms",
        aliases: ["social norms", "social norm", "norms", "group behavior"],
        levels: {
          basic: "**Social norms** are shared expectations about how people should behave in a group. They can be explicit rules or informal habits enforced by approval, disapproval, or practical consequences.",
          intermediate: "Norms coordinate behavior, reduce uncertainty, and express group values, but they can also preserve unfair arrangements. They differ from laws: laws are formally enforced rules, while norms may operate without legal authority.",
          advanced: "Norms emerge through repeated interaction, reputational incentives, institutions, identity, and power. They can persist through conformity and pluralistic ignorance, or change when coordination, leadership, sanctions, technology, or perceived legitimacy shifts.",
        },
      },
    ],
  },
  {
    id: "culture",
    label: "Culture",
    topics: [
      {
        id: "culture",
        aliases: ["culture", "cultural", "cultural norms"],
        levels: {
          basic: "**Culture** is the learned system of meanings, practices, values, symbols, knowledge, and social habits shared by a group. It is transmitted socially rather than inherited as a fixed biological package.",
          intermediate: "Cultures are internally diverse and change through migration, contact, conflict, technology, institutions, and individual creativity. Describing a cultural pattern should avoid treating every member of a group as identical.",
          advanced: "Cultural analysis examines how meanings are produced, contested, embodied, and linked to institutions and material conditions. Similar practices can have different meanings in different settings, so comparison needs historical and local context.",
        },
      },
    ],
  },
  {
    id: "religions",
    label: "Religions and religious studies",
    topics: [
      {
        id: "buddhism",
        aliases: ["buddhism", "buddhist", "buddha"],
        levels: {
          basic: "**Buddhism** is a family of religious and philosophical traditions that began in South Asia around the teachings associated with Siddhartha Gautama, the Buddha. Common themes include the Four Noble Truths, the Noble Eightfold Path, karma, rebirth, and liberation from suffering, with significant variation among traditions.",
          intermediate: "Theravada, Mahayana, and Vajrayana are broad modern groupings, not perfectly uniform boxes. Buddhist communities differ in texts, rituals, meditation practices, cosmology, and interpretations of concepts such as emptiness, compassion, and nirvana. The descriptions above are religious-studies summaries, not claims that any doctrine has been scientifically verified.",
          advanced: "Buddhist thought developed through diverse textual, monastic, philosophical, devotional, and regional histories. Analyses may distinguish early discourses, Abhidharma traditions, Madhyamaka, Yogacara, Zen, Pure Land, Tibetan systems, and modern reform movements while avoiding the assumption that one school represents all Buddhism.",
        },
      },
      {
        id: "christianity",
        aliases: ["christianity", "christian", "christians"],
        levels: {
          basic: "**Christianity** is a monotheistic religion centered on the life, teachings, death, and resurrection of Jesus of Nazareth as understood by Christian communities. The Bible is its central collection of scriptures, and worship, prayer, baptism, communion, and ethical teachings are important practices in many traditions.",
          intermediate: "Major Christian families include Catholic, Orthodox, and Protestant traditions, alongside many other churches and movements. They share important historical roots but differ on authority, sacraments, theology, worship, and church structure. Religious claims should be distinguished from historical descriptions.",
          advanced: "Christian history includes early councils, doctrinal development, schisms, reformations, colonial encounters, revival movements, and modern pluralization. Comparative study should specify the tradition, period, text, and interpretive community rather than treating Christianity as internally uniform.",
        },
      },
      {
        id: "islam",
        aliases: ["islam", "muslim", "muslims"],
        levels: {
          basic: "**Islam** is a monotheistic religion whose central scripture is the Qur'an and whose prophetic tradition is associated with Muhammad. Common practices are summarized by the Five Pillars: testimony of faith, prayer, almsgiving, fasting in Ramadan, and pilgrimage to Mecca when able.",
          intermediate: "Sunni, Shia, Ibadi, and other communities share core historical roots but differ in authority, law, theology, and interpretation. Islamic cultures are geographically and historically diverse. Statements about revelation or divine authority are theological beliefs held by Muslims, not neutral empirical findings.",
          advanced: "Islamic studies examines Qur'anic interpretation, hadith, jurisprudence, kalam, philosophy, mysticism, institutions, political history, and lived practice across regions. Analysis should distinguish normative texts, later interpretations, legal schools, historical states, and contemporary communities.",
        },
      },
      {
        id: "hinduism",
        aliases: ["hinduism", "hindu", "hindus"],
        levels: {
          basic: "**Hinduism** is a diverse family of religious traditions rooted in South Asia. Many Hindu traditions draw on texts such as the Vedas, Upanishads, Bhagavad Gita, and epics, and discuss concepts including dharma, karma, samsara, moksha, and devotion to deities.",
          intermediate: "Hindu traditions differ widely in theology, ritual, philosophy, community practice, and the importance given to particular deities or paths such as knowledge, action, meditation, or devotion. It is better understood as a plural family than as one single creed.",
          advanced: "Study of Hinduism includes Vedic ritual history, Brahmanical and non-Brahmanical movements, Vedanta and other philosophical schools, temple and domestic practice, bhakti, Tantra, caste and social history, reform, and modern identity formation. Terms require attention to language, period, and community.",
        },
      },
      {
        id: "judaism",
        aliases: ["judaism", "jewish", "jews"],
        levels: {
          basic: "**Judaism** is a monotheistic religious tradition of the Jewish people, grounded in covenant, Torah, interpretation, communal practice, and historical memory. Practices can include Sabbath observance, prayer, study, dietary rules, festivals, and life-cycle rituals, with variation among communities.",
          intermediate: "Jewish traditions include Orthodox, Conservative, Reform, Reconstructionist, secular-cultural, and other communities with different approaches to law, theology, scripture, and practice. The Hebrew Bible, rabbinic literature, and later interpretation all shape Jewish thought in different ways.",
          advanced: "Jewish studies considers ancient Israelite and Second Temple history, rabbinic formation, legal hermeneutics, philosophy, mysticism, diaspora, modernity, Zionism, and contemporary diversity. Religious identity, ethnicity, culture, and practice can overlap without being identical in every community.",
        },
      },
    ],
  },
];