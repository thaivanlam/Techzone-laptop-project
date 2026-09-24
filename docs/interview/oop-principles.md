# The Four OOP Principles in TechZone

How encapsulation, abstraction, inheritance and polymorphism show up in this
codebase, with a real class for each one. For each principle there is also an
answer you can give in an interview and a weak spot to admit honestly.

**Scope.** Object-oriented code here means the Java backend (Spring Boot, seven
modules). The frontend is React 19 with function components and hooks. It has no
`class` declarations, so it is left out. If an interviewer asks, say that the
frontend is written in a functional style and the backend is object-oriented.

---

## Summary

| Principle | One-line definition | Best example in this project |
|---|---|---|
| Encapsulation | Keep an object's state private and control how it is read and changed | `RestTemplateProductServiceClient` keeps its `baseUrl` private and cleans it up once, in the constructor |
| Abstraction | Show *what* a component does and hide *how* it does it | `ProductServiceClient`: order-service calls product-service without knowing that HTTP is involved |
| Inheritance | Reuse and specialise the behaviour of a parent type | `ResourceNotFoundException extends RuntimeException`; `CartRepository extends JpaRepository<Cart, Long>` |
| Polymorphism | One interface, many implementations, chosen at runtime | `KeycloakRealmRoleConverter implements Converter<Jwt, …>`, which Spring Security calls through the interface |

---

## 1. Encapsulation

> Put the data and the code that works on it in one class, hide the data with
> `private`, and expose only what callers need.

### Example A — `RestTemplateProductServiceClient` (strong encapsulation)

[`order-service/.../client/RestTemplateProductServiceClient.java`](../../backend/order-service/src/main/java/com/ecommerce/order_service/client/RestTemplateProductServiceClient.java)

```java
@Component
public class RestTemplateProductServiceClient implements ProductServiceClient {
    private final RestTemplate restTemplate;   // private + final: nobody can swap it
    private final String baseUrl;              // private + final: set once, never changed

    public RestTemplateProductServiceClient(RestTemplate restTemplate,
            @Value("${product.service.base-url:http://localhost:8081/api}") String baseUrl) {
        this.restTemplate = restTemplate;
        // The invariant "baseUrl never ends with '/'" is enforced in ONE place
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
    }

    private static class InventoryUpdateRequest {   // private nested class: invisible outside
        private final int quantity;
        ...
    }
}
```

What this shows:
- **The state is hidden.** `restTemplate` and `baseUrl` are `private final`,
  there are no setters, and the object cannot change after it is built.
- **The invariant is enforced.** The trailing slash is removed once, in the
  constructor. No caller has to remember to do it.
- **Implementation details are hidden.** The JSON body `InventoryUpdateRequest`
  is a `private static` nested class. The rest of order-service cannot see it,
  so the wire format can change without touching any other class.

### Example B — `GatewaySecurityProperties` (read-only collections)

[`api-gateway/.../security/GatewaySecurityProperties.java`](../../backend/api-gateway/src/main/java/com/ecommerce/api_gateway/security/GatewaySecurityProperties.java)

```java
@ConfigurationProperties(prefix = "gateway.security")
public class GatewaySecurityProperties {
    private final List<String> publicPaths = new ArrayList<>();
    private final List<RoleMapping> roleMappings = new ArrayList<>();

    public List<String> getPublicPaths() { return publicPaths; }   // getter only, no setter
    ...
}
```

The lists are `final` and have getters but no setters, so no one can replace the
list. Spring binds `gateway.security.*` from YAML into them.

### Example C — `AuthUtil` (behaviour hidden behind a small public API)

[`user-service/.../util/AuthUtil.java`](../../backend/user-service/src/main/java/com/ecommerce/user_service/util/AuthUtil.java)

It has three public methods: `loggedInEmail()`, `loggedInUserId()` and
`loggedInUser()`. The work behind them stays inside: reading the
`SecurityContextHolder`, checking that the principal is a
`JwtAuthenticationToken`, falling back from the `email` claim to
`preferred_username`, and creating a local user row on first login. All of this
is in the `private Jwt currentToken()` helper and the method bodies. A
controller only calls `authUtil.loggedInEmail()`.

### Weak spot to admit — `@Data` on entities

The JPA entities (`Product`, `Cart`, `User`, …) use Lombok's `@Data`. It
generates a **public setter for every field**, so the fields are private in name
only. For example,
[`Cart.totalPrice`](../../backend/order-service/src/main/java/com/ecommerce/order_service/model/Cart.java)
should always equal the sum of the cart lines. But `Cart` does not maintain that
itself. `CartServiceImpl` calls `cart.setTotalPrice(...)` from **eight** places,
using different formulas: some add to the old total, some subtract from it, some
recompute the whole sum.

A better design is a rich domain model. `Cart` would own the rule:

```java
public void addItem(CartItem item)  { cartItems.add(item); recalculateTotal(); }
private void recalculateTotal()     { totalPrice = cartItems.stream()
                                          .mapToDouble(i -> i.getProductPrice() * i.getQuantity()).sum(); }
// and no public setTotalPrice()
```

This is a good thing to bring up yourself in an interview. It shows you know the
difference between *having* private fields and *actually encapsulating* state.

---

## 2. Abstraction

> Show a simple contract (*what*) and hide the complex implementation (*how*).
> In Java this is done with an `interface` or an `abstract class`.

### Example A — `ProductServiceClient` (hides a network call)

[`order-service/.../client/ProductServiceClient.java`](../../backend/order-service/src/main/java/com/ecommerce/order_service/client/ProductServiceClient.java)

```java
public interface ProductServiceClient {
    ProductDTO getProductById(Long productId);
    void reduceProductQuantity(Long productId, int quantity);
}
```

`OrderServiceImpl` and `CartServiceImpl` depend on this interface, not on the
class that implements it:

```java
@Service
public class OrderServiceImpl implements OrderService {
    @Autowired
    private ProductServiceClient productServiceClient;   // the interface type
    ...
}
```

The order code asks for "product 7" or "reduce stock by 2". It does not know
that underneath there is:
- a `RestTemplate` HTTP call to `/internal/products/{id}` on another microservice,
- a base URL that comes from configuration,
- a JSON body shaped as `InventoryUpdateRequest`.

**Why it pays off (a concrete benefit).** The unit test
[`OrderServiceImplTest`](../../backend/order-service/src/test/java/com/ecommerce/order_service/unit/OrderServiceImplTest.java)
replaces the network call with `@Mock private ProductServiceClient
productServiceClient;`. Order logic is tested without product-service running.
If the team later moves to OpenFeign, WebClient or gRPC, only the implementing
class changes.

### Example B — the Service layer: `interface` plus `Impl`

Every business service comes as a pair:

| Interface | Implementation |
|---|---|
| [`ProductService`](../../backend/product-service/src/main/java/com/ecommerce/product_service/service/ProductService.java) | `ProductServiceImpl` |
| `CartService`, `OrderService`, `StripeService`, `AnalyticsService` | `…Impl` |
| `AuthService`, `AddressService` | `…Impl` |
| [`EmailService`](../../backend/notification-service/src/main/java/vn/vti/dtn2504/notificationservice/service/EmailService.java) | `EmailServiceImpl` (Gmail SMTP through `JavaMailSender`) |
| `FileService` | `FileServiceImpl` (writes images to disk) |

`ProductService` lists 12 operations: `addProduct`, `getAllProducts` with 12
filter parameters, `reduceProductQuantity`, and so on. `ProductController` only
sees that list. Paging, `Specification` queries, SKU generation and image paths
are all hidden inside `ProductServiceImpl`.

### Example C — Spring Data repositories (the strongest abstraction)

[`CartRepository`](../../backend/order-service/src/main/java/com/ecommerce/order_service/repositories/CartRepository.java)
is an interface, and **nobody on the team wrote a class that implements it**:

```java
public interface CartRepository extends JpaRepository<Cart, Long> {
    @Query("SELECT c FROM Cart c WHERE c.userEmail = ?1")
    Cart findCartByEmail(String email);
}
```

At startup, Spring Data creates a proxy that implements the interface. The code
that uses it calls `cartRepository.findCartByEmail(email)` and never deals with
SQL, `EntityManager`, connections or transactions.

### Abstraction vs. encapsulation — a common interview question

- **Abstraction** is about the design: *which* operations do I expose? It is the
  contract (`ProductServiceClient` has 2 methods).
- **Encapsulation** is about the implementation: *how* do I protect my state? It
  is access control (`private final baseUrl`).

The two work together. The interface is the abstraction. The class behind it
encapsulates the details.

---

## 3. Inheritance

> A child class takes over the fields and methods of a parent class (`extends`),
> or a type takes over the contract of an interface (`implements` / interface
> `extends`), and then adds or changes behaviour.

### Example A — custom exceptions extend `RuntimeException`

[`order-service/.../exceptions/ResourceNotFoundException.java`](../../backend/order-service/src/main/java/com/ecommerce/order_service/exceptions/ResourceNotFoundException.java)

```java
public class ResourceNotFoundException extends RuntimeException {
    String resourceName;
    String field;
    ...
    public ResourceNotFoundException(String resourceName, String field, Long fieldId) {
        super(String.format("%s not found with %s: %d", resourceName, field, fieldId));  // calls the parent constructor
        this.resourceName = resourceName;
        ...
    }
}

public class APIException extends RuntimeException {
    public APIException(String message) { super(message); }
}
```

What the child classes inherit:
- `getMessage()`, the stack trace, and `Throwable`'s ability to be thrown.
- The *unchecked* behaviour of `RuntimeException`. Service methods do not have
  to declare `throws`, and an exception thrown inside `@Transactional` rolls the
  transaction back automatically.

What the child classes add: a constructor that builds a standard message
("Product not found with productId: 7") and fields that describe the missing
resource.

`super(...)` calls the parent's constructor. This is the most basic form of
reusing code through inheritance.

### Example B — interface inheritance: `CartRepository extends JpaRepository<Cart, Long>`

Adding one `extends` clause gives `CartRepository` roughly 20 methods it never
declared: `save`, `findById`, `findAll(Pageable)`, `deleteById`, `count`, …
`CartServiceImpl` uses `cartRepository.findById(cartId)` directly, and the
method is inherited. The child interface adds only what is specific to carts
(`findCartByEmail`, `findCartsByProductId`).

This is also inheritance of a **generic** type. `<Cart, Long>` fixes the entity
type and the key type for every inherited method.

### Example C — nested value objects and composition

Not every code reuse should be inheritance. `ProductSnapshot` is an
`@Embeddable` that sits **inside** `CartItem` and `OrderItem`. This is
composition ("has-a"). Price and name fields are copied at the moment of sale,
not inherited from `Product`. If asked "why not make `CartItem extends
Product`?", the answer is:

- A cart line **is not** a product. It *refers to* a product. "is-a" is false,
  so inheritance is the wrong tool.
- `Product` belongs to a different microservice and a different database, so
  order-service cannot inherit a JPA entity it does not own.
- The rule is **"favour composition over inheritance"** (GoF, Effective Java
  item 18).

### Weak spot to admit — duplication that inheritance *could* remove, but deliberately does not

`APIException`, `ResourceNotFoundException`, `MyGlobalExceptionHandler` and
`KeycloakRealmRoleConverter` are copied into several services. In a monolith you
would put them in a shared base module. Here each microservice deliberately has
its own copy, so that no service depends on a shared library for its build or
release. This trade-off is known as "DRY vs. service independence".

---

## 4. Polymorphism

> The same call behaves differently depending on the actual object type behind
> it.
> - **Runtime (subtype) polymorphism:** an interface or parent reference points
>   to a child object, and the call goes to the child's `@Override` method
>   (dynamic dispatch).
> - **Compile-time (ad-hoc) polymorphism:** method overloading. The compiler
>   picks a method by its parameter list.

### Example A — `KeycloakRealmRoleConverter` (runtime polymorphism)

[`order-service/.../security/KeycloakRealmRoleConverter.java`](../../backend/order-service/src/main/java/com/ecommerce/order_service/security/KeycloakRealmRoleConverter.java)

```java
public class KeycloakRealmRoleConverter implements Converter<Jwt, Collection<GrantedAuthority>> {
    @Override
    public Collection<GrantedAuthority> convert(Jwt jwt) {
        // reads realm_access.roles → ROLE_USER / ROLE_SELLER / ROLE_ADMIN
    }
}
```

It is plugged in through the interface in
[`SecurityConfig`](../../backend/order-service/src/main/java/com/ecommerce/order_service/security/SecurityConfig.java):

```java
JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
converter.setJwtGrantedAuthoritiesConverter(new KeycloakRealmRoleConverter());
```

`JwtAuthenticationConverter` is Spring Security library code. It was written
years before this project and only knows the type
`Converter<Jwt, Collection<GrantedAuthority>>`. Its default implementation reads
the `scope` claim. When a request arrives, Spring calls `converter.convert(jwt)`,
and the JVM sends that call to **our** `convert` method. The library changes its
behaviour without any change to its own code. This is polymorphism together with
the Open/Closed Principle.

The same idea appears in reactive form in the gateway. There,
[`KeycloakRealmRoleConverter`](../../backend/api-gateway/src/main/java/com/ecommerce/api_gateway/security/KeycloakRealmRoleConverter.java)
implements `Converter<Jwt, Flux<GrantedAuthority>>`. The interface is the same,
but the type parameter is different, so it fits Spring WebFlux.

### Example B — one interface reference, a different object in tests and in production

```java
@Autowired
private ProductServiceClient productServiceClient;
```

| Environment | The actual object behind the reference | What `getProductById(7L)` does |
|---|---|---|
| Production | `RestTemplateProductServiceClient` | Makes an HTTP GET to product-service |
| Unit test (`OrderServiceImplTest`) | A Mockito proxy | Returns a stubbed `ProductDTO`, with no network |

`OrderServiceImpl` is the same compiled code in both rows. Only the object behind
the interface changes. Spring dependency injection is built on this kind of
polymorphism.

### Example C — polymorphic exception handling

`ProductServiceImpl` throws `new APIException(...)` and `new
ResourceNotFoundException(...)`. Both are `RuntimeException`s. Spring passes the
exception up as a `Throwable`, then
[`MyGlobalExceptionHandler`](../../backend/order-service/src/main/java/com/ecommerce/order_service/exceptions/MyGlobalExceptionHandler.java)
picks a handler by **the actual runtime type**:

```java
@ExceptionHandler(ResourceNotFoundException.class)  → 404 NOT_FOUND
@ExceptionHandler(APIException.class)               → 400 BAD_REQUEST
@ExceptionHandler(MethodArgumentNotValidException.class) → 400 + field → message map
```

Exceptions of the same parent type produce different HTTP responses depending on
which subclass was thrown.

### Example D — constructor overloading (compile-time polymorphism)

`ResourceNotFoundException` has three constructors:

```java
ResourceNotFoundException()
ResourceNotFoundException(String resourceName, String field, String fieldName)  // e.g. ("Cart", "email", "a@b.com")
ResourceNotFoundException(String resourceName, String field, Long fieldId)      // e.g. ("Product", "productId", 7L)
```

The call `new ResourceNotFoundException("Cart", "email", emailId)` (in
`OrderServiceImpl.placeOrder`) matches the `String` version.
`new ResourceNotFoundException("Product", "productId", productId)` matches the
`Long` version, and the message uses `%d` instead of `%s`. The compiler makes
this choice before the program runs.

---

## How the Four Work Together — One Request

Adding a laptop to the cart (`POST /api/carts/products/{id}/quantity/{q}`):

```
CartController
   │ calls through the CartService interface ................ ABSTRACTION
   ▼
CartServiceImpl  (implements CartService, @Override) ....... POLYMORPHISM
   │ productServiceClient.getProductById(id)
   │   → RestTemplateProductServiceClient, private baseUrl . ENCAPSULATION
   │ cartRepository.save(cart)
   │   → a method inherited from JpaRepository ............. INHERITANCE
   │ out of stock? throw new APIException(...)
   │   → extends RuntimeException .......................... INHERITANCE
   ▼
MyGlobalExceptionHandler picks a handler by runtime type .... POLYMORPHISM
```

---

## Interview Quick Answers

**"Name the four OOP principles and give an example from your project."**
> Encapsulation: the product-service HTTP client keeps its base URL private and
> final, and normalises it once in the constructor. Abstraction: order-service
> depends on a `ProductServiceClient` interface, so the fact that it is a network
> call is hidden, and in unit tests I mock it. Inheritance: our custom exceptions
> extend `RuntimeException`, and our repositories extend `JpaRepository`, so they
> get CRUD for free. Polymorphism: I implemented Spring's `Converter<Jwt, …>`
> interface to read Keycloak roles, and Spring Security calls my `convert`
> method through that interface at runtime.

**"What would you improve?"**
> The entities use Lombok `@Data`, which generates public setters. That breaks
> encapsulation. For example, the cart total is changed from eight places in the
> service layer instead of being kept correct by `Cart` itself. I would move that
> rule into a `Cart.addItem()` method and remove the setter. I would also switch
> from field `@Autowired` to constructor injection, as `AuthUtil` and
> `NotificationPublisher` already do. That makes the dependencies `final` and
> easier to see.

**"Interface or abstract class?"**
> I use an interface when I only need a contract and several unrelated
> implementations, like `ProductServiceClient` or `EmailService`. An abstract
> class makes sense when the implementations share state or code. This project
> does not have that case, because the shared code lives in Spring's own base
> classes.

---

## Related Documents

- [architecture/uml-structure.md](../architecture/uml-structure.md) — domain
  class diagram and backend layering
- [backend/overview.md](../backend/overview.md) — module layout and the
  controller → service → repository convention
- [development/developer-guide.md](../development/developer-guide.md) — backend
  conventions
