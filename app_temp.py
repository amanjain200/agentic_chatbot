from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from models import Product
from database_pro import session, engine 
import database_models
from sqlalchemy.orm import Session

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins = ["http://localhost:3000"],
    allow_methods = ['*']
)

database_models.Base.metadata.create_all(bind=engine)



@app.get("/")
def greet():
    return "Hello Aman"

products = [
    Product(id=1, name="Laptop", description="budget office laptop", price=999.99, quantity=6),
    Product(id=2, name="Phone", description="foldable phone", price=539.99, quantity=60),
    Product(id=4, name="headphone", description="noise cancelling headphone", price=99.59, quantity=30)
]



def init_db():
    db = session()

    count = db.query(database_models.Product).count

    if count == 0:
        for product in products:
            db.add(database_models.Product(**product.model_dump()))
        db.commit()

init_db()


def get_db():
    db = session()
    try:
        yield db
    finally:
        db.close()

@app.get("/product")
def get_all_products(db:Session = Depends(get_db)):
    db_products = db.query(database_models.Product).all()
    return db_products


@app.get("/product/{id}")
def get_product_by_id(id: int, db:Session = Depends(get_db)):
    db_product = db.query(database_models.Product).filter(database_models.Product.id == id).first()
    if db_product:
        return db_product
    return "Product not found"


@app.post("/product")
def add_product(product: Product, db:Session = Depends(get_db)):
    db.add(database_models.Product(**product.model_dump()))
    db.commit()
    return "Done, thanks!"


@app.put("/product/{id}")
def update_product(id: int, product: Product, db:Session = Depends(get_db)):
    db_product = db.query(database_models.Product).filter(database_models.Product.id == id).first()
    if db_product:
        db_product.name = product.name
        db_product.description = product.description
        db_product.price = product.price
        db_product.quantity = product.quantity
        db.commit()
        return "product updated"
        
    return f'product with id: {id} not found!'


@app.delete("/product")
def delete_product(id: int, db:Session = Depends(get_db)):
    db_product = db.query(database_models.Product).filter(database_models.Product.id == id).first()
    if db_product:
        db.delete(db_product)
        db.commit()
        return "product deleted"

    return f'product with id: {id} not found!'