# Traffic Prediction System (IntelliTraffic)

AI-powered traffic prediction system developed collaboratively to analyze traffic patterns and predict future traffic conditions using data science and machine learning.

## Engineering Foundation & CI/CD Workflow

This project utilizes a professional development workflow powered by GitHub Actions.

### Branching Strategy
- **main**: The production-ready, stable codebase.
- **dev**: The integration branch where features are merged for testing before release.
- **feature/*** : Individual development branches. Always create a feature branch from `dev` to work on new tasks.

### Continuous Integration (CI)
Our GitHub Actions workflow automatically validates the codebase to maintain high standards.
- **Triggers**: The CI pipeline runs on pushes and Pull Requests to the `main` and `dev` branches.
- **Validation**: 
  - **Ruff** checks Python files for code quality, pycodestyle errors, and warnings.
  - **Pytest** runs our unit test suite.
  - **Compileall** ensures all Python syntax is correct.
- **Dependency Review**: A separate workflow runs on Pull Requests to scan for vulnerable dependencies.

### Local Development Commands
Before submitting a Pull Request, verify your changes locally:
- **Run Ruff (Linter)**:
  `ruff check .`
- **Run Unit Tests**:
  `pytest tests/`

### Manual GitHub Actions Execution
You can manually trigger the CI workflow from the GitHub UI:
1. Go to the **Actions** tab in the repository.
2. Select **Traffic Prediction CI** on the left.
3. Click the **Run workflow** dropdown on the right and select the branch you want to test.

## Future Architecture (MLOps)

### ML Validation Pipeline
Currently, the pipeline validates code structure and logic. As the ML models mature, the pipeline will expand to include automated model validation:
- Data validation and preprocessing checks
- Automated model training 
- Evaluation metrics extraction (MAE, RMSE, R²)
- Threshold validation (e.g., RMSE must be below a certain value before merging)
- Model artifact generation

### Deployment Architecture
The future deployment flow is designed to seamlessly push validated code and models to the cloud (e.g., Microsoft Azure).
1. Code merged to `main`
2. CI validates code (`pytest`, `ruff`)
3. ML Validation evaluates model performance
4. Build pipeline containerizes the application
5. Deployment pipeline provisions and pushes to the Azure target environment.
