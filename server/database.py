import sqlite3
from datetime import datetime
from werkzeug.security import generate_password_hash
from config import Config

class Database:
    """Gestione del database SQLite"""
    
    def __init__(self, db_path=Config.DATABASE_PATH):
        self.db_path = db_path
        self.init_database()
    
    def get_connection(self):
        """Crea una connessione al database"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn
    
    def init_database(self):
        """Inizializza le tabelle del database"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        # Tabella Utenti
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS utenti (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                nome TEXT,
                cognome TEXT,
                ente_predefinito TEXT,
                ruolo TEXT DEFAULT 'utente',
                attivo BOOLEAN DEFAULT 1,
                data_creazione TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                ultimo_accesso TIMESTAMP
            )
        ''')
        
        # Tabella Enti/Organizzazioni
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS enti (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                nome TEXT NOT NULL,
                descrizione TEXT,
                stato TEXT DEFAULT 'in_attesa',
                data_creazione TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES utenti(id)
            )
        ''')

        # Tabella Organigramma approvativo (ordine sequenziale degli organi)
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS organigramma (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ordine INTEGER NOT NULL,
                nome TEXT NOT NULL
            )
        ''')

        # Collegamento account Protocollo.net per utente
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS protocollonet_link (
                user_id INTEGER PRIMARY KEY,
                access_token TEXT NOT NULL,
                data_collegamento TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES utenti(id)
            )
        ''')
        
        # Tabella Unità Operative
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS unita_operative (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ente_id INTEGER NOT NULL,
                nome TEXT NOT NULL,
                descrizione TEXT,
                data_creazione TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (ente_id) REFERENCES enti(id)
            )
        ''')
        
        # Tabella Anagrafica
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS anagrafica (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                tipo TEXT NOT NULL,
                denominazione TEXT NOT NULL,
                nome TEXT,
                cognome TEXT,
                email TEXT,
                telefono TEXT,
                indirizzo TEXT,
                citta TEXT,
                cap TEXT,
                provincia TEXT,
                paese TEXT DEFAULT 'Italia',
                codice_fiscale TEXT,
                partita_iva TEXT,
                pec TEXT,
                note TEXT,
                data_creazione TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                data_modifica TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES utenti(id)
            )
        ''')
        
        # Tabella Fascicoli
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS fascicoli (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                numero_fascicolo TEXT NOT NULL,
                anno INTEGER NOT NULL,
                titolo TEXT NOT NULL,
                descrizione TEXT,
                ente_id INTEGER,
                unita_operativa_id INTEGER,
                data_apertura DATE NOT NULL,
                data_chiusura DATE,
                denunzia TEXT,
                stato TEXT DEFAULT 'aperto',
                data_creazione TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                data_modifica TIMESTAMP,
                annullato BOOLEAN DEFAULT 0,
                motivo_annullamento TEXT,
                data_annullamento TIMESTAMP,
                annullato_da INTEGER,
                FOREIGN KEY (user_id) REFERENCES utenti(id),
                FOREIGN KEY (ente_id) REFERENCES enti(id),
                FOREIGN KEY (unita_operativa_id) REFERENCES unita_operative(id),
                UNIQUE(user_id, numero_fascicolo, anno)
            )
        ''')
        
        # Tabella Protocolli
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS protocolli (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                fascicolo_id INTEGER,
                numero_protocollo TEXT NOT NULL,
                anno INTEGER NOT NULL,
                data_protocollo TIMESTAMP NOT NULL,
                oggetto TEXT NOT NULL,
                data_documento DATE,
                argomento TEXT,
                classificazione TEXT DEFAULT 'pubblico',
                password_cripto TEXT,
                ente_id INTEGER,
                unita_operativa_id INTEGER,
                tipo_movimento TEXT NOT NULL,
                tipo_documento TEXT,
                modalita_invio TEXT,
                mittente_destinatario_id INTEGER,
                descrizione_breve TEXT,
                denunzia TEXT,
                numero_allegati INTEGER DEFAULT 0,
                elenco_allegati TEXT,
                barcode TEXT,
                stato TEXT DEFAULT 'attivo',
                annullato BOOLEAN DEFAULT 0,
                motivo_annullamento TEXT,
                data_annullamento TIMESTAMP,
                annullato_da INTEGER,
                data_creazione TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                data_modifica TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES utenti(id),
                FOREIGN KEY (fascicolo_id) REFERENCES fascicoli(id),
                FOREIGN KEY (ente_id) REFERENCES enti(id),
                FOREIGN KEY (unita_operativa_id) REFERENCES unita_operative(id),
                FOREIGN KEY (mittente_destinatario_id) REFERENCES anagrafica(id),
                UNIQUE(user_id, numero_protocollo, anno)
            )
        ''')
        
        # Tabella Allegati
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS allegati (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                protocollo_id INTEGER NOT NULL,
                nome_file TEXT NOT NULL,
                path_file TEXT NOT NULL,
                dimensione INTEGER,
                tipo_mime TEXT,
                timbrato BOOLEAN DEFAULT 0,
                path_file_timbrato TEXT,
                data_caricamento TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (protocollo_id) REFERENCES protocolli(id)
            )
        ''')
        
        # Tabella Log Sistema
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS log_sistema (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                azione TEXT NOT NULL,
                entita TEXT NOT NULL,
                entita_id INTEGER,
                descrizione TEXT,
                dati_precedenti TEXT,
                dati_nuovi TEXT,
                ip_address TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES utenti(id)
            )
        ''')

        # ─── Tabelle aggiuntive specifiche DocTouché! ──────────────────────
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS documenti (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                fascicolo_id INTEGER,
                titolo TEXT NOT NULL,
                contenuto_html TEXT,
                stato TEXT DEFAULT 'bozza',
                data_creazione TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                data_modifica TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES utenti(id),
                FOREIGN KEY (fascicolo_id) REFERENCES fascicoli(id)
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS documenti_condivisioni (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                documento_id INTEGER NOT NULL,
                email TEXT NOT NULL,
                ruolo TEXT NOT NULL DEFAULT 'viewer',
                data_creazione TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (documento_id) REFERENCES documenti(id)
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS workflow_approvazioni (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                documento_id INTEGER NOT NULL,
                organo TEXT NOT NULL,
                stato TEXT DEFAULT 'in_attesa',
                step_corrente INTEGER DEFAULT 1,
                data_creazione TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                data_modifica TIMESTAMP,
                FOREIGN KEY (documento_id) REFERENCES documenti(id)
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS normativa (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                titolo TEXT NOT NULL,
                testo TEXT,
                riferimento TEXT,
                categoria TEXT,
                data_pubblicazione DATE,
                data_creazione TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        conn.commit()
        conn.close()
