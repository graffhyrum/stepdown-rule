// FM3: cart-composition pattern - fix flips violation to different dep
// composeCartDomain calls A,B,C and sessionStoreToRepository
const composeCartDomain = () => ({
    presenter: createCartPresenter(),
    useCase: createCartUseCase(),
    controller: createCartController(),
    repo: sessionStoreToRepository(),
});
const sessionStoreToRepository = () => ({});
const createCartController = () => ({});
const createCartUseCase = () => ({});
const createCartPresenter = () => ({});
