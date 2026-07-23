
from sqlalchemy.orm import sessionmaker
from sqlalchemy import create_engine

# Use the PostgreSQL dialect that SQLAlchemy can actually load.
db_url = "postgresql+psycopg://postgres:12345678@localhost:5432/ecom"
engine = create_engine(db_url)
session = sessionmaker(autocommit=False, autoflush=False, bind=engine)

