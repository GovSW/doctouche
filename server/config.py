import os

class Config:
    # Su PythonAnywhere: /home/doctouche/doctouche-server/doctouche.db
    DATABASE_PATH = os.environ.get('DOCTOUCHE_DB_PATH', 'doctouche.db')
    SECRET_KEY = os.environ.get('DOCTOUCHE_SECRET_KEY', 'CHANGE_ME')
