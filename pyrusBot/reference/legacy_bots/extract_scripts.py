import pandas as pd
import json
import os

def extract():
    file_path = 'Скрипты.xlsx'
    output_path = 'scripts_dump.json'
    
    if not os.path.exists(file_path):
        print(f"Error: {file_path} not found.")
        return

    try:
        # Read the Excel file
        df = pd.read_excel(file_path)
        
        # Convert to dictionary
        data = df.to_dict(orient='records')
        
        # Write to JSON with UTF-8 encoding to avoid charmap errors
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            
        print(f"Successfully extracted {len(data)} rows to {output_path}")
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    extract()
