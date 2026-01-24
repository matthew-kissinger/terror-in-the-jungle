def count_lines(file_path):
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return len(f.readlines())
    except OSError:
        return 0

def analyze_codebase():
    # Get all TypeScript/JavaScript files
    import os
    files_data = []
    extensions = {'.ts', '.tsx', '.js', '.jsx'}
    exclude_dirs = {'node_modules', 'dist', '.git', 'build'}

    for root, dirs, files in os.walk('.'):
        # Remove excluded directories from the search
        dirs[:] = [d for d in dirs if d not in exclude_dirs]

        for file in files:
            if any(file.endswith(ext) for ext in extensions):
                file_path = os.path.join(root, file)
                lines = count_lines(file_path)
                # Make path relative and use forward slashes
                relative_path = os.path.relpath(file_path, '.').replace('\\', '/')
                files_data.append((relative_path, lines))

    # Sort by lines of code
    files_data.sort(key=lambda x: x[1], reverse=True)

    # Print all files with LOC
    print("=== ALL FILES BY LINES OF CODE ===\n")
    total_lines = 0
    for path, lines in files_data:
        print(f"{lines:6d} lines: {path}")
        total_lines += lines

    print("\n=== SUMMARY ===")
    print(f"Total files: {len(files_data)}")
    print(f"Total lines: {total_lines:,}")
    avg = total_lines // len(files_data) if files_data else 0
    print(f"Average lines per file: {avg}")

    print("\n=== TOP 10 FILES ===")
    for i, (path, lines) in enumerate(files_data[:10], 1):
        print(f"{i}. {path}: {lines} lines")

    return files_data[:10]

if __name__ == "__main__":
    top_files = analyze_codebase()
