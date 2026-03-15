-- ============================================================================
-- EduSphere v2 -- Seed Data
-- All data sourced from src/store/appStore.ts
-- Created: 2026-03-13
-- ============================================================================

-- ============================================================================
-- ADMIN EMAILS (placeholder)
-- ============================================================================

INSERT INTO public.admin_emails (email) VALUES
  ('studentscommittee2020@gmail.com');

-- ============================================================================
-- COURSES: French Track -- Common (LS1-LS3)
-- ============================================================================

INSERT INTO public.courses (code, title, title_fr, credits, semester, major, type, track) VALUES
  -- Common LS1
  ('fc1',  'Accounting 1',       'Comptabilite 1',        5,   'LS1', 'Common', 'common', 'french'),
  ('fc2',  'Math 1',             'Maths 1',               5,   'LS1', 'Common', 'common', 'french'),
  ('fc3',  'General IT',         'Info Generale',          5,   'LS1', 'Common', 'common', 'french'),
  ('fc4',  'Microeconomics',     'Microeconomie',         5,   'LS1', 'Common', 'common', 'french'),
  ('fc5',  'French 1',           'Francais 1',            3,   'LS1', 'Common', 'common', 'french'),
  ('fc6',  'Business Law',       'Droits des Affaires',   5,   'LS1', 'Common', 'common', 'french'),
  -- Common LS2
  ('fc7',  'Management',         'Management',            5,   'LS2', 'Common', 'common', 'french'),
  ('fc8',  'Accounting 2',       'Comptabilite 2',        5,   'LS2', 'Common', 'common', 'french'),
  ('fc9',  'Marketing',          'Marketing',             5,   'LS2', 'Common', 'common', 'french'),
  ('fc10', 'Statistics 1',       'Statistiques 1',        5,   'LS2', 'Common', 'common', 'french'),
  ('fc11', 'Applied IT',         'Info Appliquee',         4,   'LS2', 'Common', 'common', 'french'),
  ('fc12', 'Macroeconomics',     'Macroeconomie',         5,   'LS2', 'Common', 'common', 'french'),
  ('fc13', 'Human Rights',       'Droits de l''Homme',    3,   'LS2', 'Common', 'common', 'french'),
  ('fc14', 'Cost Accounting 1',  'Compta Analytique 1',   5,   'LS2', 'Common', 'common', 'french'),
  -- Common LS3
  ('fc15', 'HR Management',      'GRH',                   5,   'LS3', 'Common', 'common', 'french'),
  ('fc16', 'Financial Math',     'Maths Finance',         4,   'LS3', 'Common', 'common', 'french'),
  ('fc17', 'Math 2',             'Maths 2',               3,   'LS3', 'Common', 'common', 'french'),
  ('fc18', 'Financial Analysis', 'Analyse Financiere',    5,   'LS3', 'Common', 'common', 'french'),
  ('fc19', 'French 2',           'Francais 2',            3,   'LS3', 'Common', 'common', 'french');

-- ============================================================================
-- COURSES: French Track -- Audit (LS4-LS6)
-- ============================================================================

INSERT INTO public.courses (code, title, title_fr, credits, semester, major, type, track) VALUES
  ('fa1',  'Operations Research',  'RO',                     5,   'LS4', 'Audit & Accounting', 'major', 'french'),
  ('fa2',  'Money & Banking',      'Monnaie et Banque',      5,   'LS4', 'Audit & Accounting', 'major', 'french'),
  ('fa3',  'Personal Accounting',  'Compta des Personnes',   5,   'LS4', 'Audit & Accounting', 'major', 'french'),
  ('fa4',  'Banking Accounting',   'Compta Bancaire',        5,   'LS5', 'Audit & Accounting', 'major', 'french'),
  ('fa5',  'Internal Audit',       'Audit Interne',          5,   'LS5', 'Audit & Accounting', 'major', 'french'),
  ('fa6',  'Banking Law',          'Droits Bancaires',       2.5, 'LS5', 'Audit & Accounting', 'major', 'french'),
  ('fa7',  'Tax Accounting',       'Compta Fiscale',         5,   'LS5', 'Audit & Accounting', 'major', 'french'),
  ('fa8',  'Audit Methodology',    'Metho. d''Audit',        5,   'LS6', 'Audit & Accounting', 'major', 'french'),
  ('fa9',  'Capital Accounting',   'Compta des Capitaux',    5,   'LS6', 'Audit & Accounting', 'major', 'french'),
  ('fa10', 'Cost Accounting 2',    'Compta Analytique 2',    5,   'LS6', 'Audit & Accounting', 'major', 'french');

-- ============================================================================
-- COURSES: French Track -- Finance (LS4-LS6)
-- ============================================================================

INSERT INTO public.courses (code, title, title_fr, credits, semester, major, type, track) VALUES
  ('ff1',  'Financial Markets',       'Marches Financiers',       5,   'LS4', 'Finance', 'major', 'french'),
  ('ff2',  'Corporate Finance',       'Finance d''Entreprise',    5,   'LS4', 'Finance', 'major', 'french'),
  ('ff3',  'Financial Instruments',   'Instruments Financiers',   5,   'LS5', 'Finance', 'major', 'french'),
  ('ff4',  'Portfolio Management',    'Gestion de Portefeuille',  5,   'LS5', 'Finance', 'major', 'french'),
  ('ff5',  'International Finance',   'Finance Internationale',   4,   'LS5', 'Finance', 'major', 'french'),
  ('ff6',  'Financial Risk',          'Risque Financier',         5,   'LS6', 'Finance', 'major', 'french'),
  ('ff7',  'Financial Modeling',      'Modelisation Financiere',  5,   'LS6', 'Finance', 'major', 'french'),
  ('ff8',  'Derivatives',             'Produits Derives',         4,   'LS6', 'Finance', 'major', 'french');

-- ============================================================================
-- COURSES: French Track -- Marketing (LS4-LS6)
-- ============================================================================

INSERT INTO public.courses (code, title, title_fr, credits, semester, major, type, track) VALUES
  ('fmk1', 'Consumer Behavior',       'Comportement du Consommateur', 5, 'LS4', 'Marketing', 'major', 'french'),
  ('fmk2', 'Digital Marketing',       'Marketing Digital',            5, 'LS4', 'Marketing', 'major', 'french'),
  ('fmk3', 'Brand Management',        'Gestion de Marque',            5, 'LS5', 'Marketing', 'major', 'french'),
  ('fmk4', 'Market Research',         'Etudes de Marche',             4, 'LS5', 'Marketing', 'major', 'french'),
  ('fmk5', 'Sales Management',        'Gestion des Ventes',           4, 'LS5', 'Marketing', 'major', 'french'),
  ('fmk6', 'International Marketing', 'Marketing International',      5, 'LS6', 'Marketing', 'major', 'french'),
  ('fmk7', 'Advertising & Media',     'Publicite et Medias',          4, 'LS6', 'Marketing', 'major', 'french'),
  ('fmk8', 'E-Commerce',              'E-Commerce',                   4, 'LS6', 'Marketing', 'major', 'french');

-- ============================================================================
-- COURSES: French Track -- Management (LS4-LS6)
-- ============================================================================

INSERT INTO public.courses (code, title, title_fr, credits, semester, major, type, track) VALUES
  ('fmg1', 'Strategic Management',       'Management Strategique',        5, 'LS4', 'Management', 'major', 'french'),
  ('fmg2', 'Organizational Behavior',    'Comportement Organisationnel',  5, 'LS4', 'Management', 'major', 'french'),
  ('fmg3', 'Project Management',         'Gestion de Projets',            5, 'LS5', 'Management', 'major', 'french'),
  ('fmg4', 'Operations Management',      'Management des Operations',     4, 'LS5', 'Management', 'major', 'french'),
  ('fmg5', 'Change Management',          'Management du Changement',      4, 'LS5', 'Management', 'major', 'french'),
  ('fmg6', 'Quality Management',         'Management de la Qualite',      5, 'LS6', 'Management', 'major', 'french'),
  ('fmg7', 'Entrepreneurship',           'Entrepreneuriat',               5, 'LS6', 'Management', 'major', 'french'),
  ('fmg8', 'Business Ethics',            'Ethique des Affaires',          3, 'LS6', 'Management', 'major', 'french');

-- ============================================================================
-- COURSES: French Track -- MIS (LS4-LS6)
-- ============================================================================

INSERT INTO public.courses (code, title, title_fr, credits, semester, major, type, track) VALUES
  ('fmis1', 'Database Systems',       'Systemes de BD',             5, 'LS4', 'MIS', 'major', 'french'),
  ('fmis2', 'Systems Analysis',       'Analyse des Systemes',       5, 'LS4', 'MIS', 'major', 'french'),
  ('fmis3', 'Business Intelligence',  'Intelligence d''Affaires',   5, 'LS5', 'MIS', 'major', 'french'),
  ('fmis4', 'ERP Systems',            'Systemes ERP',               4, 'LS5', 'MIS', 'major', 'french'),
  ('fmis5', 'Cybersecurity',          'Cybersecurite',              4, 'LS5', 'MIS', 'major', 'french'),
  ('fmis6', 'Data Science',           'Science des Donnees',        5, 'LS6', 'MIS', 'major', 'french'),
  ('fmis7', 'Cloud Computing',        'Informatique en Nuage',      4, 'LS6', 'MIS', 'major', 'french'),
  ('fmis8', 'IT Project Management',  'Gestion de Projets IT',      4, 'LS6', 'MIS', 'major', 'french');

-- ============================================================================
-- COURSES: English Track -- Common (LS1-LS3)
-- ============================================================================

INSERT INTO public.courses (code, title, title_fr, credits, semester, major, type, track) VALUES
  -- Common LS1
  ('ec1',  'Accounting 1',       'Accounting 1',       5, 'LS1', 'Common', 'common', 'english'),
  ('ec2',  'Math 1',             'Math 1',             5, 'LS1', 'Common', 'common', 'english'),
  ('ec3',  'General IT',         'General IT',         5, 'LS1', 'Common', 'common', 'english'),
  ('ec4',  'Microeconomics',     'Microeconomics',     5, 'LS1', 'Common', 'common', 'english'),
  ('ec5',  'English 1',          'English 1',          3, 'LS1', 'Common', 'common', 'english'),
  ('ec6',  'Business Law',       'Business Law',       5, 'LS1', 'Common', 'common', 'english'),
  -- Common LS2
  ('ec7',  'Management',         'Management',         5, 'LS2', 'Common', 'common', 'english'),
  ('ec8',  'Accounting 2',       'Accounting 2',       5, 'LS2', 'Common', 'common', 'english'),
  ('ec9',  'Marketing',          'Marketing',          5, 'LS2', 'Common', 'common', 'english'),
  ('ec10', 'Statistics 1',       'Statistics 1',       5, 'LS2', 'Common', 'common', 'english'),
  ('ec11', 'Applied IT',         'Applied IT',         4, 'LS2', 'Common', 'common', 'english'),
  ('ec12', 'Macroeconomics',     'Macroeconomics',     5, 'LS2', 'Common', 'common', 'english'),
  ('ec13', 'Human Rights',       'Human Rights',       3, 'LS2', 'Common', 'common', 'english'),
  ('ec14', 'Cost Accounting 1',  'Cost Accounting 1',  5, 'LS2', 'Common', 'common', 'english'),
  -- Common LS3
  ('ec15', 'HR Management',      'HR Management',      5, 'LS3', 'Common', 'common', 'english'),
  ('ec16', 'Financial Math',     'Financial Math',     4, 'LS3', 'Common', 'common', 'english'),
  ('ec17', 'Math 2',             'Math 2',             3, 'LS3', 'Common', 'common', 'english'),
  ('ec18', 'Financial Analysis', 'Financial Analysis', 5, 'LS3', 'Common', 'common', 'english'),
  ('ec19', 'English 2',          'English 2',          3, 'LS3', 'Common', 'common', 'english');

-- ============================================================================
-- COURSES: English Track -- Audit (LS4-LS6)
-- ============================================================================

INSERT INTO public.courses (code, title, title_fr, credits, semester, major, type, track) VALUES
  ('ea1',  'Operations Research',  'Operations Research',  5,   'LS4', 'Audit & Accounting', 'major', 'english'),
  ('ea2',  'Money & Banking',      'Money & Banking',      5,   'LS4', 'Audit & Accounting', 'major', 'english'),
  ('ea3',  'Personal Accounting',  'Personal Accounting',  5,   'LS4', 'Audit & Accounting', 'major', 'english'),
  ('ea4',  'Banking Accounting',   'Banking Accounting',   5,   'LS5', 'Audit & Accounting', 'major', 'english'),
  ('ea5',  'Internal Audit',       'Internal Audit',       5,   'LS5', 'Audit & Accounting', 'major', 'english'),
  ('ea6',  'Banking Law',          'Banking Law',          2.5, 'LS5', 'Audit & Accounting', 'major', 'english'),
  ('ea7',  'Tax Accounting',       'Tax Accounting',       5,   'LS5', 'Audit & Accounting', 'major', 'english'),
  ('ea8',  'Audit Methodology',    'Audit Methodology',    5,   'LS6', 'Audit & Accounting', 'major', 'english'),
  ('ea9',  'Capital Accounting',   'Capital Accounting',   5,   'LS6', 'Audit & Accounting', 'major', 'english'),
  ('ea10', 'Cost Accounting 2',    'Cost Accounting 2',    5,   'LS6', 'Audit & Accounting', 'major', 'english');

-- ============================================================================
-- PREVIOUS EXAMS
-- Uses subquery to resolve course codes to UUIDs.
-- ============================================================================

INSERT INTO public.previous_exams (course_id, course_title, course_title_fr, major, semester, year, exam_type, pages, rating, track) VALUES
  -- French track exams
  ((SELECT id FROM public.courses WHERE code = 'fc1'),  'Accounting 1',       'Comptabilite 1',               'Common',     'LS1', '2024', 'final', 4, 4.5, 'french'),
  ((SELECT id FROM public.courses WHERE code = 'fc2'),  'Math 1',             'Maths 1',                      'Common',     'LS1', '2024', 'midterms', 3, 4.2, 'french'),
  ((SELECT id FROM public.courses WHERE code = 'fc4'),  'Microeconomics',     'Microeconomie',                'Common',     'LS1', '2023', 'final', 5, 4.8, 'french'),
  ((SELECT id FROM public.courses WHERE code = 'fc8'),  'Accounting 2',       'Comptabilite 2',               'Common',     'LS2', '2024', 'final', 6, 4.3, 'french'),
  ((SELECT id FROM public.courses WHERE code = 'fc9'),  'Marketing',          'Marketing',                    'Common',     'LS2', '2024', 'midterms', 4, 4.0, 'french'),
  ((SELECT id FROM public.courses WHERE code = 'fc10'), 'Statistics 1',       'Statistiques 1',               'Common',     'LS2', '2023', 'resit',   3, 3.8, 'french'),
  ((SELECT id FROM public.courses WHERE code = 'fc18'), 'Financial Analysis', 'Analyse Financiere',           'Common',     'LS3', '2024', 'final', 5, 4.6, 'french'),
  ((SELECT id FROM public.courses WHERE code = 'fc15'), 'HR Management',      'GRH',                          'Common',     'LS3', '2023', 'midterms', 4, 4.1, 'french'),
  ((SELECT id FROM public.courses WHERE code = 'fa1'),  'Operations Research','RO',                           'Audit & Accounting', 'LS4', '2024', 'final',   5, 4.4, 'french'),
  ((SELECT id FROM public.courses WHERE code = 'fa5'),  'Internal Audit',     'Audit Interne',                'Audit & Accounting', 'LS5', '2024', 'final',   6, 4.7, 'french'),
  ((SELECT id FROM public.courses WHERE code = 'fa7'),  'Tax Accounting',     'Compta Fiscale',               'Audit & Accounting', 'LS5', '2023', 'midterms', 4, 4.2, 'french'),
  ((SELECT id FROM public.courses WHERE code = 'fa8'),  'Audit Methodology',  'Metho. d''Audit',              'Audit & Accounting', 'LS6', '2024', 'final',   7, 4.9, 'french'),
  ((SELECT id FROM public.courses WHERE code = 'ff1'),  'Financial Markets',  'Marches Financiers',           'Finance',    'LS4', '2024', 'final', 5, 4.5, 'french'),
  ((SELECT id FROM public.courses WHERE code = 'ff2'),  'Corporate Finance',  'Finance d''Entreprise',        'Finance',    'LS4', '2023', 'midterms', 4, 4.3, 'french'),
  ((SELECT id FROM public.courses WHERE code = 'ff6'),  'Financial Risk',     'Risque Financier',             'Finance',    'LS6', '2024', 'final', 6, 4.6, 'french'),
  ((SELECT id FROM public.courses WHERE code = 'fmk1'), 'Consumer Behavior',  'Comportement du Consommateur', 'Marketing',  'LS4', '2024', 'final', 4, 4.2, 'french'),
  ((SELECT id FROM public.courses WHERE code = 'fmk2'), 'Digital Marketing',  'Marketing Digital',            'Marketing',  'LS4', '2023', 'midterms', 3, 4.0, 'french'),
  ((SELECT id FROM public.courses WHERE code = 'fmg1'), 'Strategic Management','Management Strategique',      'Management', 'LS4', '2024', 'final', 5, 4.5, 'french'),
  ((SELECT id FROM public.courses WHERE code = 'fmis1'),'Database Systems',   'Systemes de BD',               'MIS',        'LS4', '2024', 'final', 6, 4.8, 'french'),
  ((SELECT id FROM public.courses WHERE code = 'fmis3'),'Business Intelligence','Intelligence d''Affaires',   'MIS',        'LS5', '2023', 'midterms', 4, 4.4, 'french'),
  -- English track exams
  ((SELECT id FROM public.courses WHERE code = 'ec1'),  'Accounting 1',       'Accounting 1',                 'Common',     'LS1', '2024', 'final', 4, 4.4, 'english'),
  ((SELECT id FROM public.courses WHERE code = 'ec4'),  'Microeconomics',     'Microeconomics',               'Common',     'LS1', '2023', 'midterms', 3, 4.1, 'english'),
  ((SELECT id FROM public.courses WHERE code = 'ec8'),  'Accounting 2',       'Accounting 2',                 'Common',     'LS2', '2024', 'final', 5, 4.3, 'english'),
  ((SELECT id FROM public.courses WHERE code = 'ec18'), 'Financial Analysis', 'Financial Analysis',           'Common',     'LS3', '2024', 'final', 5, 4.5, 'english'),
  ((SELECT id FROM public.courses WHERE code = 'ea5'),  'Internal Audit',     'Internal Audit',               'Audit & Accounting', 'LS5', '2024', 'final',   6, 4.6, 'english'),
  ((SELECT id FROM public.courses WHERE code = 'ea8'),  'Audit Methodology',  'Audit Methodology',            'Audit & Accounting', 'LS6', '2023', 'resit',   4, 3.9, 'english'),
  -- 2025 exams
  ((SELECT id FROM public.courses WHERE code = 'fc12'), 'Macroeconomics',     'Macroeconomie',                'Common',     'LS2', '2025', 'final', 4, 4.7, 'french'),
  ((SELECT id FROM public.courses WHERE code = 'fc16'), 'Financial Math',     'Maths Finance',                'Common',     'LS3', '2025', 'midterms', 3, 4.2, 'french'),
  ((SELECT id FROM public.courses WHERE code = 'fmg7'), 'Entrepreneurship',   'Entrepreneuriat',              'Management', 'LS6', '2025', 'final', 5, 4.8, 'french'),
  ((SELECT id FROM public.courses WHERE code = 'fmis6'),'Data Science',       'Science des Donnees',          'MIS',        'LS6', '2025', 'final', 6, 4.9, 'french'),
  ((SELECT id FROM public.courses WHERE code = 'ff7'),  'Financial Modeling', 'Modelisation Financiere',      'Finance',    'LS6', '2025', 'midterms', 5, 4.7, 'french'),
  ((SELECT id FROM public.courses WHERE code = 'fmk6'), 'International Marketing','Marketing International',  'Marketing',  'LS6', '2025', 'final', 4, 4.5, 'french');

-- ============================================================================
-- ENTRANCE EXAMS
-- ============================================================================

INSERT INTO public.entrance_exams (title, title_fr, subject, exam_lang, year, difficulty, pages, rating, description, description_fr) VALUES
  ('French Language 2024',  'Francais 2024',           'French',    'French',  '2024', 'Medium', 4, 4.5,
   'Comprehensive French language exam covering grammar, comprehension and essay writing.',
   'Examen complet de langue francaise couvrant la grammaire, la comprehension et la redaction.'),

  ('French Language 2023',  'Francais 2023',           'French',    'French',  '2023', 'Easy',   3, 4.2,
   'Standard French entrance exam with text analysis and written expression sections.',
   'Examen d''entree standard de francais avec sections d''analyse de texte et expression ecrite.'),

  ('English Language 2024', 'Anglais 2024',            'English',   'English', '2024', 'Medium', 4, 4.6,
   'English proficiency exam with reading comprehension, grammar and essay sections.',
   'Examen de competence en anglais avec comprehension de lecture, grammaire et redaction.'),

  ('English Language 2023', 'Anglais 2023',            'English',   'English', '2023', 'Easy',   3, 4.3,
   'English entrance examination focused on business vocabulary and writing skills.',
   'Examen d''entree en anglais axe sur le vocabulaire commercial et les competences redactionnelles.'),

  ('Mathematics 2024',      'Mathematiques 2024',      'Math',      'French',  '2024', 'Hard',   5, 4.7,
   'Advanced math exam covering calculus, linear algebra and statistics for business applications.',
   'Examen de mathematiques avancees couvrant le calcul, l''algebre lineaire et les statistiques.'),

  ('Mathematics 2023',      'Mathematiques 2023',      'Math',      'French',  '2023', 'Hard',   4, 4.4,
   'Business mathematics exam with financial calculations, probability and optimization problems.',
   'Examen de mathematiques des affaires avec calculs financiers, probabilites et optimisation.'),

  ('Mathematics 2022',      'Mathematiques 2022',      'Math',      'French',  '2023', 'Medium', 4, 4.1,
   'Mathematics exam focusing on algebra, functions and basic statistics.',
   'Examen de mathematiques axe sur l''algebre, les fonctions et les statistiques de base.'),

  ('Economics 2024',         'Economie 2024',          'Economics', 'French',  '2024', 'Medium', 5, 4.8,
   'Macroeconomics and microeconomics exam covering market theory, national income and monetary policy.',
   'Examen de macro et microeconomie couvrant la theorie des marches, le revenu national et la politique monetaire.'),

  ('Economics 2023',         'Economie 2023',          'Economics', 'French',  '2023', 'Easy',   4, 4.5,
   'General economics exam with supply and demand analysis, consumer theory and market structures.',
   'Examen general d''economie avec analyse de l''offre et la demande, theorie du consommateur.'),

  ('French Language 2025',  'Francais 2025',           'French',    'French',  '2025', 'Medium', 4, 4.9,
   'Latest French entrance exam with modern literature comprehension and structured essay.',
   'Dernier examen d''entree de francais avec comprehension de litterature moderne et dissertation.'),

  ('English Language 2025', 'Anglais 2025',            'English',   'English', '2025', 'Medium', 4, 4.8,
   'Latest English entrance exam with business case analysis and formal writing.',
   'Dernier examen d''entree en anglais avec analyse de cas business et redaction formelle.'),

  ('Mathematics 2025',      'Mathematiques 2025',      'Math',      'French',  '2025', 'Hard',   5, 4.9,
   'Current year mathematics exam featuring probability, matrix algebra and financial math.',
   'Examen de mathematiques de l''annee courante avec probabilites, algebre matricielle et maths financieres.'),

  ('Economics 2025',         'Economie 2025',          'Economics', 'French',  '2025', 'Medium', 5, 4.7,
   'Current year economics exam covering recent economic events and classic theory.',
   'Examen d''economie de l''annee courante couvrant les evenements economiques recents et la theorie classique.'),

  ('Arabic Language 2024',  'Arabe 2024',              'French',    'Arabic',  '2024', 'Easy',   3, 4.3,
   'Arabic language comprehension and writing exam for the entrance selection.',
   'Examen de comprehension et redaction en langue arabe pour la selection a l''entree.'),

  ('English Math 2024',     'Maths en Anglais 2024',   'Math',      'English', '2024', 'Hard',   4, 4.6,
   'Mathematics exam in English for the English track entrance selection.',
   'Examen de mathematiques en anglais pour la selection d''entree de la filiere anglophone.'),

  ('English Economics 2024','Economie en Anglais 2024','Economics', 'English', '2024', 'Medium', 4, 4.4,
   'Economics entrance exam in English covering micro and macroeconomic fundamentals.',
   'Examen d''entree d''economie en anglais couvrant les fondamentaux micro et macroeconomiques.'),

  ('French Language 2022',  'Francais 2022',           'French',    'French',  '2023', 'Easy',   3, 4.0,
   'Older French entrance examination useful for early practice and reference.',
   'Ancien examen d''entree de francais utile pour la pratique precoce et la reference.');

-- ============================================================================
-- BOOKS
-- ============================================================================

INSERT INTO public.books (title, title_fr, author, price, rating, major, semesters, in_stock, related_courses, track) VALUES
  ('Principles of Accounting',        'Principes de Comptabilite',        'Weygandt & Kieso',          2500, 4.7, 'Common',     'LS1, LS2',     TRUE,  ARRAY['fc1','fc8'],         'both'),
  ('Business Mathematics',            'Mathematiques des Affaires',       'Clendenen & Salzman',       2200, 4.4, 'Common',     'LS1, LS2',     TRUE,  ARRAY['fc2','fc17'],        'both'),
  ('Principles of Economics',         'Principes d''Economie',            'Mankiw',                    3000, 4.8, 'Common',     'LS1, LS2',     TRUE,  ARRAY['fc4','fc12'],        'both'),
  ('Management: An Introduction',     'Introduction au Management',       'Robbins & Coulter',         2800, 4.5, 'Common',     'LS2',          FALSE, ARRAY['fc7'],               'both'),
  ('Marketing Essentials',            'Fondamentaux du Marketing',        'Kotler & Armstrong',        2600, 4.6, 'Common',     'LS2',          TRUE,  ARRAY['fc9'],               'both'),
  ('Business Statistics',             'Statistiques de Gestion',          'Groebner et al.',           2400, 4.3, 'Common',     'LS2, LS3',     TRUE,  ARRAY['fc10'],              'both'),
  ('Financial Statement Analysis',    'Analyse des Etats Financiers',     'White & Sondhi',            3200, 4.7, 'Common',     'LS3',          TRUE,  ARRAY['fc18'],              'both'),
  ('Auditing and Assurance',          'Audit et Assurance',               'Arens & Elder',             3500, 4.8, 'Audit & Accounting', 'LS5, LS6',     TRUE,  ARRAY['fa5','fa8'],         'both'),
  ('Tax Accounting Guide',            'Guide de Comptabilite Fiscale',    'Pratt & Kulsrud',           2900, 4.5, 'Audit & Accounting', 'LS5',          TRUE,  ARRAY['fa7'],               'french'),
  ('Corporate Finance',               'Finance d''Entreprise',            'Brealey & Myers',           3800, 4.9, 'Finance',    'LS4, LS5',     TRUE,  ARRAY['ff2','ff6'],         'both'),
  ('Investment Analysis',             'Analyse des Investissements',      'Reilly & Brown',            3400, 4.6, 'Finance',    'LS4, LS5',     FALSE, ARRAY['ff1','ff4'],         'both'),
  ('Financial Derivatives',           'Produits Derives Financiers',      'Hull',                      4000, 4.7, 'Finance',    'LS6',          TRUE,  ARRAY['ff8'],               'both'),
  ('Consumer Behavior',               'Comportement du Consommateur',     'Schiffman & Kanuk',         2700, 4.4, 'Marketing',  'LS4',          TRUE,  ARRAY['fmk1'],              'both'),
  ('Digital Marketing Strategy',      'Strategie de Marketing Digital',   'Chaffey & Ellis-Chadwick',  2800, 4.5, 'Marketing',  'LS4, LS5',     TRUE,  ARRAY['fmk2','fmk8'],       'both'),
  ('Strategic Management',            'Management Strategique',           'Thompson & Strickland',     3100, 4.6, 'Management', 'LS4, LS5',     TRUE,  ARRAY['fmg1'],              'both'),
  ('Project Management Professional', 'Management de Projets',            'PMBOK Guide',               3600, 4.8, 'Management', 'LS5',          FALSE, ARRAY['fmg3'],              'both'),
  ('Database Systems',                'Systemes de Bases de Donnees',     'Connolly & Begg',           3300, 4.7, 'MIS',        'LS4, LS5',     TRUE,  ARRAY['fmis1','fmis3'],     'both'),
  ('Cybersecurity Fundamentals',      'Fondamentaux de la Cybersecurite', 'Kim & Solomon',             3000, 4.5, 'MIS',        'LS5',          TRUE,  ARRAY['fmis5'],             'both'),
  ('Data Science from Scratch',       'Science des Donnees',              'Joel Grus',                 2900, 4.6, 'MIS',        'LS6',          TRUE,  ARRAY['fmis6'],             'english'),
  ('Operations Research',             'Recherche Operationnelle',         'Hillier & Lieberman',       3200, 4.7, 'Audit & Accounting', 'LS4',          TRUE,  ARRAY['fa1','ea1'],         'both'),
  ('International Marketing',         'Marketing International',          'Cateora & Graham',          2800, 4.4, 'Marketing',  'LS6',          TRUE,  ARRAY['fmk6'],              'both'),
  ('Entrepreneurship',                'Entrepreneuriat',                  'Hisrich & Peters',          2600, 4.3, 'Management', 'LS6',          FALSE, ARRAY['fmg7'],              'both'),
  ('Money Banking and Finance',       'Monnaie Banque et Finance',        'Mishkin',                   3100, 4.6, 'Audit & Accounting',      'LS4',          TRUE,  ARRAY['fa2','ea2'],         'both'),
  ('ERP with SAP',                    'ERP avec SAP',                     'Magal & Word',              3400, 4.5, 'MIS',        'LS5',          TRUE,  ARRAY['fmis4'],             'both');

-- ============================================================================
-- EVENTS
-- ============================================================================

INSERT INTO public.events (title, date, time, location, attendees, tag, description, type) VALUES
  ('Annual Academic Conference 2025',  'March 25, 2025',    '9:00 AM - 5:00 PM',  'Main Amphitheater', 450,  'Academic',   'The annual gathering of faculty, students and industry professionals for presentations on business and economics research.', 'upcoming'),
  ('Finance & Investment Workshop',    'April 5, 2025',     '2:00 PM - 6:00 PM',  'Room B204',         120,  'Workshop',   'Hands-on workshop covering stock market analysis, portfolio construction and risk assessment techniques for finance students.', 'upcoming'),
  ('Digital Marketing Bootcamp',       'April 12, 2025',    '10:00 AM - 4:00 PM', 'Computer Lab C3',   80,   'Workshop',   'Intensive one-day bootcamp on social media strategy, SEO, and data-driven marketing campaigns.',                              'upcoming'),
  ('Alumni Networking Night',          'April 20, 2025',    '6:00 PM - 9:00 PM',  'Faculty Garden',    200,  'Networking', 'Connect with FSEG 2 alumni working in top companies across Lebanon and abroad. Great opportunity for internship leads.',       'upcoming'),
  ('Entrepreneurship & Startup Fair',  'May 3, 2025',       '9:00 AM - 3:00 PM',  'Sports Hall',       350,  'Science',    'Student startup pitching competition with jury of investors and entrepreneurs. Cash prizes for top 3 teams.',                  'upcoming'),
  ('Guest Lecture: Fintech Revolution','May 15, 2025',      '3:00 PM - 5:00 PM',  'Amphitheater A',    300,  'Lecture',    'Senior executive from a leading Lebanese bank discusses how fintech is reshaping banking and financial services.',              'upcoming'),
  ('Cultural Week 2025',               'June 2, 2025',      'All Day',             'Campus Wide',       800,  'Cultural',   'Annual celebration of student diversity featuring food stalls, performances and exhibitions from all Lebanese regions.',        'upcoming'),
  ('Spring Sports Tournament',         'June 10, 2025',     '8:00 AM - 6:00 PM',  'Sports Complex',    500,  'Sports',     'Inter-faculty sports day featuring football, basketball, volleyball and table tennis. Open to all students.',                  'upcoming'),
  ('Career & Internship Fair 2024',    'November 15, 2024', '9:00 AM - 4:00 PM',  'Sports Hall',       620,  'Networking', 'Over 40 companies attended offering internships and graduate positions to final year students across all majors.',              'past'),
  ('Annual Graduation Ceremony 2024',  'December 20, 2024', '4:00 PM - 8:00 PM',  'Main Amphitheater', 1200, 'Academic',   'Graduation ceremony for the class of 2024 celebrating the academic achievement of over 300 graduates.',                      'past');

-- ============================================================================
-- END OF SEED DATA
-- ============================================================================
