import csv
    
class ParamLoader(object):
    def __init__(self):
        self.p = {}
    
    def __repr__(self):
        return f'ParamLoader Object: {self.p}'
    
    def update_parameters(self, fname: str = '../config/params.txt'):
        with open(fname, 'r') as f:
            tsv_file = csv.reader(f, delimiter="\t")
            for line in tsv_file:
                if line[2]=="None":
                    self.p[line[0]] = line[1]
                elif line[2]=="bool":
                    self.p[line[0]] = line[1] == "True"
                else:
                    self.p[line[0]] = float(line[1])
                    
                    
if __name__ == "__main__":
    obj = ParamLoader()
    obj.update_parameters()
    print(obj)
    